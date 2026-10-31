/* Neon Object Storage (S3 compatível): backups do estado do Fluxo. */
'use strict';

const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { cloudError } = require('./cloud-error');

let client = null;

function bucket() {
  return process.env.FLUXO_BACKUP_BUCKET || 'fluxo-backups';
}

function configured() {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.AWS_ENDPOINT_URL_S3 &&
    process.env.AWS_REGION
  );
}

function getClient() {
  if (!configured()) {
    throw cloudError(
      503,
      'Object Storage não configurado. Rode `neon deploy` para gerar as variáveis AWS_*.',
      'STORAGE_NOT_CONFIGURED'
    );
  }
  if (!client) {
    client = new S3Client({
      region: process.env.AWS_REGION,
      endpoint: process.env.AWS_ENDPOINT_URL_S3,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });
  }
  return client;
}

function userPrefix(userId) {
  return `users/${userId}/backups/`;
}

function assertOwnedKey(userId, key) {
  if (typeof key !== 'string' || !key.startsWith(userPrefix(userId))) {
    throw cloudError(400, 'Backup inválido para este usuário.', 'INVALID_BACKUP_KEY');
  }
}

async function health(userId) {
  const s3 = getClient();
  const key = `health/${userId}.json`;
  const body = JSON.stringify({ ok: true, at: new Date().toISOString() });

  await s3.send(new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
    Body: body,
    ContentType: 'application/json',
    CacheControl: 'no-store'
  }));

  const object = await s3.send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  const received = await object.Body.transformToString();
  if (received !== body) {
    throw cloudError(502, 'O Object Storage devolveu um objeto diferente do enviado.', 'STORAGE_ROUNDTRIP_FAILED');
  }

  await s3.send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  return { ok: true, bucket: bucket() };
}

async function putBackup(userId, state) {
  const s3 = getClient();
  const createdAt = Date.now();
  const key = `${userPrefix(userId)}${createdAt}-r${Number(state.revision) || 0}.json`;
  const payload = {
    app: 'fluxo',
    kind: 'cloud-backup',
    exportedAt: new Date(createdAt).toISOString(),
    revision: Number(state.revision) || 0,
    updatedAt: state.updatedAt || null,
    data: state.data
  };
  const body = JSON.stringify(payload);

  await s3.send(new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
    Body: body,
    ContentType: 'application/json',
    CacheControl: 'private, no-store',
    Metadata: {
      userid: String(userId),
      revision: String(Number(state.revision) || 0)
    }
  }));

  return {
    ok: true,
    key,
    bucket: bucket(),
    bytes: Buffer.byteLength(body, 'utf8'),
    createdAt
  };
}

async function listBackups(userId) {
  const s3 = getClient();
  const result = await s3.send(new ListObjectsV2Command({
    Bucket: bucket(),
    Prefix: userPrefix(userId),
    MaxKeys: 100
  }));

  return (result.Contents || [])
    .filter((item) => item.Key)
    .map((item) => ({
      key: item.Key,
      size: Number(item.Size) || 0,
      lastModified: item.LastModified ? item.LastModified.toISOString() : null
    }))
    .sort((a, b) => String(b.key).localeCompare(String(a.key)));
}

async function backupUrl(userId, key) {
  assertOwnedKey(userId, key);
  const s3 = getClient();
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
    { expiresIn: 300 }
  );
}

async function deleteBackup(userId, key) {
  assertOwnedKey(userId, key);
  const s3 = getClient();
  await s3.send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  return { ok: true, key };
}

module.exports = {
  configured,
  health,
  putBackup,
  listBackups,
  backupUrl,
  deleteBackup,
  bucket
};
