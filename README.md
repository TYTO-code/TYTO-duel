# TYTO-duel

Serviço de Duelos da API do TYTO.club (Express + TypeScript + firebase-admin).

Um membro desafia outro para um duelo (`codigo`, `hacking` ou `outro`) apostando
Dracmas. Não há escrow: a aposta só sai da conta do perdedor quando ele confirma
o resultado (`/confirm`), numa `db.runTransaction()` que debita/credita
`users` e `public_users`, registra um `duel_payout` em `transactions` e fecha o duelo.

## Rodando

```bash
npm install
cp .env.example .env   # configure as credenciais do firebase-admin
npm run dev            # http://localhost:3002
npm run build && npm start
```

## Deploy

Roda como **serviço separado** (deploy próprio, igual ao TYTO-email): `npm run build`
e `npm start`, com as credenciais do firebase-admin e, de preferência, `CORS_ORIGIN`
restrito ao domínio do frontend. O frontend (`TYTO.club`) aponta
`VITE_DUEL_API_URL` para a URL base deste serviço e usa a página `/duelos`
(`src/pages/Duelos.tsx`, cliente em `src/services/duelService.ts`).

## Endpoints (`/api/duels`, todos com `Authorization: Bearer <Firebase ID token>`)

| Método | Rota | Quem | Transição |
| --- | --- | --- | --- |
| GET | `/` | participante | lista duelos do usuário |
| GET | `/disputed` | admin (`users/{uid}.admin`) | lista duelos `disputed` |
| POST | `/` | qualquer membro | cria `pending` |
| POST | `/:id/accept` | desafiado | `pending` → `active` |
| POST | `/:id/decline` | desafiado | `pending` → `declined` |
| POST | `/:id/cancel` | desafiante | `pending` → `cancelled` |
| POST | `/:id/report-result` | participante | `active` → `awaiting_payment` |
| POST | `/:id/confirm` | perdedor reportado | `awaiting_payment` → `completed` (paga a aposta) |
| POST | `/:id/dispute` | perdedor reportado | `awaiting_payment` → `disputed` |
| POST | `/:id/resolve` | admin | `disputed` → `awaiting_payment` |

Respostas: `{ success: true, data }` ou `{ success: false, message }`. A `message` sai no idioma
do membro, com a mesma regra do frontend: `users/{uid}.locale` se for pt/es, senão o idioma
principal do navegador (`Accept-Language`), senão inglês. As notificações continuam em pt-BR.
Um resultado arbitrado pelo Conselho (`/resolve`) não pode ser contestado de novo.

## Mapa das Pólis

`src/lib/mapConnection.ts` espelha cada duelo entre Pólis diferentes em `map_connections/duel_{id}`
(melhor esforço, nunca falha a requisição do duelo). Como não existe rota de exclusão de duelo, um
`duels/{id}` só desaparece por fora da API (ex.: edição manual no console do Firestore) — nesse caso,
a próxima sincronização real apaga a conexão órfã sozinha, mas nada aciona essa sincronização para um
duelo que já não existe. `expiresAt` (30 dias, renovado a cada sincronização) é gravado para permitir
uma política de TTL do Firestore (passo manual no console GCP, fora do que este serviço consegue fazer
sozinho) como rede de segurança adicional. Para limpar o que já ficou órfão antes desta correção, rode
`node scripts/limpar-conexoes-orfas.mjs` (simula) ou `--apply` (apaga de verdade) depois de `npm run build`.

## Contribuindo

1. Crie uma branch a partir da `main`: `git checkout -b minha-feature`
2. Faça commit das alterações: `git commit -m "Descrição da alteração"`
3. Envie a branch: `git push origin minha-feature`
4. Abra um Pull Request
