# VermeuLucro — Como Replicar

## PASSO 1 — Firebase (banco de dados)
1. Acesse: https://firebase.google.com
2. Crie projeto → dê um nome
3. Authentication → Sign-in method → Ative Email/Senha e Google
4. Firestore Database → Criar banco → Modo produção
5. Configurações → Seus apps → Web → Copie as chaves

## PASSO 2 — Edite as chaves
Abra: src/lib/firebase.ts
Substitua os placeholders pelas chaves do Firebase do aluno/cliente.

## PASSO 3 — Suba no Vercel
1. Crie conta em vercel.com (gratuito)
2. Conecte o GitHub
3. Importe o repositório → Deploy automático

## PASSO 4 — Domínio (opcional)
- Vercel: Settings → Domains → adicione o domínio
- Registro.br: configure o DNS apontando para o Vercel
