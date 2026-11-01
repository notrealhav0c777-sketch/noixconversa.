# NoixConversa

## Configuração
1. Crie um projeto gratuito em https://supabase.com.
2. No **SQL Editor**, rode o conteúdo de `supabase/schema.sql`.
3. Em **Project Settings → API**, copie a *Project URL* e a chave *anon public*.
4. Na Vercel, importe este projeto e adicione as variáveis de `.env.example`
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_MIN_PEOPLE`, `VITE_MAX_PEOPLE`).
5. Deploy. Para testar local: copie `.env.example` para `.env`, `npm install`, `npm run dev`.

Se mudar o limite máximo (padrão 50), altere também o valor `50` em `create_room` no SQL.
