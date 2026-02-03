# iBar-vendas

Sistema de controle de vendas e mesas para bar e restaurante.

## Tecnologias

- React + TypeScript + Vite
- Dexie (IndexedDB) para persistência offline
- PWA (Progressive Web App) com vite-plugin-pwa

## Desenvolvimento

```bash
npm install    # Instalar dependências
npm run dev    # Servidor de desenvolvimento (http://localhost:5173)
npm run build  # Build de produção (pasta dist/)
```

## Estrutura de Branches

| Branch | Descrição |
|--------|-----------|
| `main` | Código fonte - faça suas alterações aqui |
| `gh-pages` | Build de produção - **NÃO EDITE DIRETAMENTE** |

## Deploy para GitHub Pages

Após fazer alterações no `main`, execute o deploy:

```bash
npm run deploy
```

Ou manualmente:
```bash
npm run build
cd dist
git init
git add -A
git commit -m "Deploy"
git branch -M gh-pages
git remote add origin https://github.com/devItaloAraujo/i-bar-vendas.git
git push -f origin gh-pages
cd ..
```

**URL do app:** https://devitaloaraujo.github.io/i-bar-vendas/

## Fluxo de Trabalho

1. Faça alterações no código (branch `main`)
2. Teste localmente com `npm run dev`
3. Commit no `main`: `git add . && git commit -m "mensagem" && git push`
4. Deploy: `npm run deploy`

## Instalação como PWA (para o cliente)

1. Acesse a URL do app no Chrome
2. Clique no ícone ⊕ na barra de endereço
3. Clique "Instalar"
4. O app funciona 100% offline após a primeira instalação

## Como atualizar o app na máquina do cliente (após novo deploy)

Depois que você fizer um novo deploy (`npm run deploy`), o cliente precisa **atualizar o app** para ver as mudanças:

1. **Feche o app completamente** (feche a janela do iBar-vendas instalado).
2. **Abra de novo** pelo ícone do app (área de trabalho ou menu do sistema).

Ou, se o app estiver aberto em uma aba do navegador:

- **Atualize a página**: F5 (Windows/Linux) ou Cmd+R (Mac), ou use o botão de atualizar do navegador.

O PWA está configurado para buscar atualizações automaticamente. Na próxima abertura (ou após dar F5), o app já estará na versão nova.
