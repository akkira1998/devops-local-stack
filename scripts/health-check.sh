#!/bin/bash

echo "🏥 Checking health of all services..."
echo ""

services=(
  "http://localhost:80|Nginx"
  "http://localhost:3000/health|App"
  "http://localhost:9090/-/healthy|Prometheus"
  "http://localhost:3001/api/health|Grafana"
)

failed=0

for service in "${services[@]}"; do
  url=$(echo $service | cut -d'|' -f1)
  name=$(echo $service | cut -d'|' -f2)

  if curl -sf "$url" > /dev/null 2>&1; then
    echo "✅ $name"
  else
    echo "❌ $name"
    ((failed++))
  fi
done

echo ""
if [ $failed -eq 0 ]; then
  echo "✅ All services healthy!"
  exit 0
else
  echo "❌ $failed service(s) failed"
  exit 1
fi