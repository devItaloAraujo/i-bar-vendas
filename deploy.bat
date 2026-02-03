@echo off
echo Building app...
call npm run build

echo.
echo Deploying to GitHub Pages...
cd dist
if exist .git rmdir /s /q .git
git init
git add -A
git commit -m "Deploy"
git branch -M gh-pages
git remote add origin https://github.com/devItaloAraujo/i-bar-vendas.git
git push -f origin gh-pages
cd ..

echo.
echo ========================================
echo Deploy complete!
echo URL: https://devitaloaraujo.github.io/i-bar-vendas/
echo ========================================
