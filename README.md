# second-brain-mcp

MCP local-first para gerenciar um second brain em arquivos. O servidor recebe texto via tools MCP e escreve tudo dentro de uma raiz configurada, sem exigir que consumidores tenham acesso direto às pastas.

## Pastas

A raiz vem de `SECOND_BRAIN_ROOT` ou de `.second-brain/config.json`.

```text
SECOND_BRAIN_ROOT/
  raw/
  wiki/
    rejected/
  outputs/
  .second-brain/
    manifest.json
```

- `raw/`: documentos fonte recebidos como texto.
- `wiki/`: artigos de conhecimento. Entram como `pending_audit`.
- `wiki/rejected/`: drafts reprovados, removíveis depois do TTL.
- `outputs/`: respostas, relatórios e sínteses geradas.

## Auditoria

`wiki_search` só retorna itens com status `approved`. Todo `wiki_input` cria um item `pending_audit`, que precisa passar por `audit_update`.

Reprovações exigem comentário e movem o arquivo para `wiki/rejected/`. O tempo de retenção é configurado por `SECOND_BRAIN_REJECTED_RETENTION_DAYS`, com padrão de 30 dias.

## Tools MCP

- `raw_input`
- `raw_search`
- `wiki_input`
- `wiki_search`
- `outputs_input`
- `outputs_search`
- `audit_list`
- `audit_update`
- `purge_rejected`

## Configuração

Preferencialmente:

```powershell
$env:SECOND_BRAIN_ROOT="C:\Users\ajaxl\Documents\my-second-brain"
$env:SECOND_BRAIN_REJECTED_RETENTION_DAYS="30"
```

Veja também [.env.example](C:/Users/ajaxl/Documents/second-brain-mcp/.env.example).

Fallback opcional em `.second-brain/config.json` no diretório onde o servidor roda:

```json
{
  "root": "C:\\Users\\ajaxl\\Documents\\my-second-brain",
  "rejectedRetentionDays": 30
}
```

## Desenvolvimento

```powershell
npm install
npm test
npm run test:coverage
npm run mutate
npm run build
```

O projeto exige cobertura global mínima de 90% no Vitest. Testes de mutação rodam com Stryker via `npm run mutate`.

## Transportes

Por padrão, o servidor roda em `stdio`, adequado para clientes MCP locais:

```powershell
npm run build
npm start
```

Para Streamable HTTP:

```powershell
$env:MCP_TRANSPORT="http"
$env:HOST="127.0.0.1"
$env:PORT="3000"
$env:MCP_HTTP_PATH="/mcp"
npm start
```

Também existe:

```powershell
npm run start:http
```

Endpoints HTTP:

- `GET /health`
- `POST /mcp`
- `GET /mcp`
- `DELETE /mcp`

## Docker

O container roda em HTTP por padrão e usa `/data/second-brain` como raiz interna.

```powershell
docker compose up --build
```

Por padrão, o MCP fica em `http://127.0.0.1:3000/mcp`, com health check em `http://127.0.0.1:3000/health`.
