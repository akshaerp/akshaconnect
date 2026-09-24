/*
AkshaConnect SSO smoke test from app.akshaerp.com.

Run this in the browser developer console ONLY while logged into app.akshaerp.com.
It does not put the ERP bearer token in a URL. The token is POSTed in the form body
to connect.akshaerp.com, where it is immediately verified server-to-server through IGW.
*/
(() => {
  const token = window.localStorage.getItem('token');
  if (!token) {
    throw new Error('No AkshaERP token found in localStorage. Sign in to app.akshaerp.com first.');
  }

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = 'https://connect.akshaerp.com/api/v1/auth/akshaerp/sso';
  form.target = 'akshaconnect-sso';
  form.style.display = 'none';

  const tokenInput = document.createElement('input');
  tokenInput.type = 'hidden';
  tokenInput.name = 'erp_access_token';
  tokenInput.value = token;

  const returnInput = document.createElement('input');
  returnInput.type = 'hidden';
  returnInput.name = 'return_path';
  returnInput.value = '/';

  form.appendChild(tokenInput);
  form.appendChild(returnInput);
  document.body.appendChild(form);

  window.open('about:blank', 'akshaconnect-sso');
  form.submit();

  window.setTimeout(() => form.remove(), 1000);
})();
