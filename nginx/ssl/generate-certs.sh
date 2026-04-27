#!/bin/bash
# ✅ SECURITY: Generate self-signed SSL certificates for development
# For production, use Let's Encrypt or your certificate authority

echo "🔐 Generating self-signed SSL certificates for development..."

openssl req -x509 \
  -newkey rsa:4096 \
  -keyout key.pem \
  -out cert.pem \
  -days 365 \
  -nodes \
  -subj "/C=RU/ST=Moscow/L=Moscow/O=AccessWeb/CN=localhost" \
  2>/dev/null

if [ -f "cert.pem" ] && [ -f "key.pem" ]; then
  echo "✅ SSL certificates generated successfully!"
  echo "   - cert.pem (certificate)"
  echo "   - key.pem (private key)"
  echo ""
  echo "⚠️  These are self-signed certificates for development only!"
  echo "   For production, use Let's Encrypt or your certificate authority."
else
  echo "❌ Failed to generate SSL certificates"
  exit 1
fi
