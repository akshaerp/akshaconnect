# Realtime service

Target owner: AkshaConnect.

The current ERP implementation includes a WebSocket realtime server/hub and a PostgreSQL cross-process relay. Extraction must preserve the current ordering invariant: SystemSender message behavior is wrapped before the cross-process publisher bridge is installed.
