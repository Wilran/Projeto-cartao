# Painel financeiro

App de finanças pessoais em Next.js, pronto para publicar no Vercel.

## Como os dados são salvos

Este projeto **não tem backend nem banco de dados** — tudo é salvo em
`localStorage`, ou seja, direto no seu navegador, no seu dispositivo. Isso
significa:

- Os dados ficam só no navegador/aparelho onde você usa o site. Se abrir em
  outro celular ou computador, começa vazio lá.
- Se limpar os dados de navegação do navegador, os lançamentos somem.
- Ninguém além de você tem acesso aos seus dados (nada é enviado para
  nenhum servidor).

Se no futuro você quiser sincronizar entre aparelhos, o próximo passo é
adicionar um banco de dados (ex: Supabase ou Postgres via Prisma) — o app
atual foi pensado para já separar os dados (hook `useFinanceData`) de forma
que dê para trocar por chamadas de API sem reescrever as telas.

## Rodar localmente

Pré-requisito: [Node.js](https://nodejs.org) 18 ou mais recente.

```bash
npm install
npm run dev
```

Abra http://localhost:3000

## Publicar no GitHub + Vercel

1. Crie um repositório novo no GitHub (pode ser privado).
2. Na pasta deste projeto:
   ```bash
   git init
   git add .
   git commit -m "Painel financeiro inicial"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
   git push -u origin main
   ```
3. Entre em [vercel.com](https://vercel.com), faça login com sua conta do
   GitHub.
4. Clique em **Add New → Project**, escolha o repositório que você acabou
   de criar.
5. O Vercel já detecta que é um projeto Next.js automaticamente — não
   precisa mudar nada nas configurações de build. Clique em **Deploy**.
6. Em poucos minutos o Vercel te dá uma URL pública (algo como
   `seu-projeto.vercel.app`). Pronto, o painel está no ar.

Toda vez que você der `git push` para o `main`, o Vercel publica a nova
versão automaticamente.

## Estrutura do projeto

```
app/
  layout.js        layout raiz do Next.js
  page.js           carrega o componente principal
  globals.css       estilos globais + Tailwind
components/
  FinanceApp.jsx    todo o painel financeiro (dashboard, soldo,
                     despesas, cartão, metas, investimentos)
```
