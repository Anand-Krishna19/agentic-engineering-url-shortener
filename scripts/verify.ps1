$ErrorActionPreference = "Stop"

Write-Host "🔍 Running lint..." -ForegroundColor Cyan
npm run lint

Write-Host "🔍 Running typecheck..." -ForegroundColor Cyan
npm run typecheck

Write-Host "🔍 Running tests..." -ForegroundColor Cyan
npm test

Write-Host "✅ All checks passed!" -ForegroundColor Green