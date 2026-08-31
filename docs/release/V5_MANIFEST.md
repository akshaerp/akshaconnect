# V5 Manifest — P0-V5 Provider Architecture

Version: `0.5.0-phase0`

Base checkpoint:

`2b2f3de5bba846cb5e82ac08b11c1af9380f41b1`

P0-V5 adds:

- provider-neutral identity/business configuration
- pure standalone `LOCAL` + `NONE` mode
- AkshaConnect-owned local identity adapter boundary
- explicit unavailable ERP capability adapter
- compatibility with the P0-V4 AkshaERP connector
- tests proving standalone composition does not require or call AkshaERP

P0-V5 does not yet implement durable local users/sessions or the AkshaERP-side Integration Gateway receiver.
