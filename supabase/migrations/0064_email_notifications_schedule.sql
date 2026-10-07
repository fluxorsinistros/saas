-- 0064: agenda no próprio banco a chamada que processa as notificações por e-mail, a cada 5 minutos.
-- O segredo é lido de private.notif_config dentro do comando; nada fica escrito aqui.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

select cron.schedule(
  'fluxor-notificacoes',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url := 'https://fluxor.elsem.com.br/api/notificacoes/processar',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notif-secret', (select secret from private.notif_config)),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $cron$
);
