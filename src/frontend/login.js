// Login.
const form = document.getElementById('loginForm');
const msg = document.getElementById('loginMsg');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.textContent = '';
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  try {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }).then(x => x.json());
    if (r.error) throw new Error(r.error);
    window.location.href = '/';
  } catch (err) {
    msg.textContent = err.message;
  }
});
