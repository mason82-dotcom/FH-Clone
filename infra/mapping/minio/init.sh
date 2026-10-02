#!/bin/sh
set -eu

until mc alias set local http://mapping-minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; do
  echo "waiting for mapping-minio..."
  sleep 2
done

mc mb --ignore-existing "local/$MAPPING_MEDIA_BUCKET"
mc mb --ignore-existing "local/$MAPPING_RESULTS_BUCKET"

cat > /tmp/mapping-policy.json <<POL
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::$MAPPING_MEDIA_BUCKET",
        "arn:aws:s3:::$MAPPING_MEDIA_BUCKET/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::$MAPPING_RESULTS_BUCKET",
        "arn:aws:s3:::$MAPPING_RESULTS_BUCKET/*"
      ]
    }
  ]
}
POL

mc admin policy create local fh2-mapping-rw /tmp/mapping-policy.json >/dev/null 2>&1 || true
mc admin user add local "$MAPPING_S3_ACCESS_KEY" "$MAPPING_S3_SECRET_KEY" >/dev/null 2>&1 || true
mc admin policy attach local fh2-mapping-rw --user "$MAPPING_S3_ACCESS_KEY" >/dev/null

echo "FH2 mapping object store initialized"
