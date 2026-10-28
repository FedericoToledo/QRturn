document.querySelector('#demo-reiniciar')?.addEventListener('click', () => {
  if (!window.confirm('¿Volver a los datos de ejemplo?')) return;
  localStorage.removeItem('dentapp-demo-v1');
  sessionStorage.removeItem('dentapp-demo-sesion');
  location.reload();
});
