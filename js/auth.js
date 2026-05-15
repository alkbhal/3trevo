// js/auth.js
// Helpers de autenticação reutilizáveis
// Requer: supabase-client.js carregado antes

const Auth = (() => {
  // Retorna a sessão atual (ou null)
  async function getSession() {
    const { data: { session } } = await sb.auth.getSession();
    return session;
  }

  // Retorna o usuário atual (ou null)
  async function getUser() {
    const session = await getSession();
    return session ? session.user : null;
  }

  // Envia magic link
  async function sendMagicLink(email) {
    const redirectTo = window.location.origin + '/area-cliente.html';
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo }
    });
    return { error };
  }

  // Logout
  async function signOut() {
    await sb.auth.signOut();
  }

  // Garante que o usuário está logado; se não, redireciona para área do cliente (tela de login)
  async function requireAuth() {
    const user = await getUser();
    if (!user) {
      window.location.href = '/area-cliente.html?redirect=' + encodeURIComponent(window.location.href);
      return null;
    }
    return user;
  }

  // Escuta mudanças de sessão
  function onAuthChange(callback) {
    return sb.auth.onAuthStateChange((_event, session) => {
      callback(session ? session.user : null, session);
    });
  }

  return { getSession, getUser, sendMagicLink, signOut, requireAuth, onAuthChange };
})();
