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
npm run dev            # http://localhost:3001
npm run build && npm start
```

O router é exportado em `src/routes/duels.ts` e pode ser montado na API principal
com `app.use("/api/duels", duelRoutes)`.

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

Respostas: `{ success: true, data }` ou `{ success: false, message }` (mensagem em pt-BR).
Um resultado arbitrado pelo Conselho (`/resolve`) não pode ser contestado de novo.
