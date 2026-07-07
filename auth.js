// ============================================================
// Cobertura de Escalas · SAD-BH
// auth.js — Login por link mágico (Supabase Auth) + resolução
// de perfil via RPC meu_acesso().
// Requer supabase-client.js carregado antes.
// ============================================================
(function () {
  var _pending = [];
  var _done = false;

  // ---- API pública ----
  window.authReady = function (fn) {
    if (_done) { fn(); } else { _pending.push(fn); }
  };

  window.meuAcesso = null; // { perfil, equipe_id, equipe_nome, pessoa_id, pessoa_nome }

  window.authLogout = function () {
    supabaseClient.auth.signOut().then(function () {
      window.location.reload();
    });
  };

  // ---- Internos ----
  function _fire() {
    _done = true;
    var cbs = _pending.slice(); _pending = [];
    cbs.forEach(function (fn) { fn(); });
  }

  function _el(id) { return document.getElementById(id); }

  function _injectOverlay() {
    if (_el('auth-overlay')) return;
    var div = document.createElement('div');
    div.id = 'auth-overlay';
    div.innerHTML =
      '<div class="auth-card">' +
        '<div class="auth-icon">&#x1F3E5;</div>' +
        '<h2>Cobertura de Escalas</h2>' +
        '<p class="auth-sub">SAD BH</p>' +
        '<div id="auth-step-email">' +
          '<label class="auth-label">Informe seu e-mail institucional</label>' +
          '<input id="auth-email-input" type="email" placeholder="email@pbh.gov.br" autocomplete="email">' +
          '<button id="auth-btn-enviar">Enviar link de acesso</button>' +
        '</div>' +
        '<div id="auth-step-sent" style="display:none">' +
          '<p class="auth-sent-msg">Link enviado! Confira seu e-mail e clique no link para entrar.</p>' +
        '</div>' +
        '<div id="auth-step-negado" style="display:none">' +
          '<p class="auth-negado-msg">Seu e-mail não está autorizado a acessar este sistema. Fale com o gestor do SAD BH.</p>' +
          '<button id="auth-btn-sair">Sair</button>' +
        '</div>' +
        '<p id="auth-status"></p>' +
      '</div>';
    document.body.insertBefore(div, document.body.firstChild);

    _el('auth-btn-enviar').addEventListener('click', _enviarLink);
    _el('auth-email-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') _enviarLink();
    });
  }

  function _setStatus(msg, isError) {
    var el = _el('auth-status');
    if (!el) return;
    el.textContent = msg || '';
    el.style.color = isError ? '#c0392b' : '#6b7a96';
  }

  function _enviarLink() {
    var email = (_el('auth-email-input').value || '').trim();
    if (!email) { _setStatus('Informe seu e-mail.', true); return; }
    _setStatus('Enviando...', false);
    _el('auth-btn-enviar').disabled = true;

    supabaseClient.auth.signInWithOtp({
      email: email,
      options: { emailRedirectTo: window.location.href }
    }).then(function (res) {
      _el('auth-btn-enviar').disabled = false;
      if (res.error) {
        _setStatus('Erro: ' + res.error.message, true);
        return;
      }
      _el('auth-step-email').style.display = 'none';
      _el('auth-step-sent').style.display = 'block';
    });
  }

  function _mostrarNegado() {
    _el('auth-step-email').style.display = 'none';
    _el('auth-step-sent').style.display = 'none';
    _el('auth-step-negado').style.display = 'block';
    _el('auth-btn-sair').addEventListener('click', window.authLogout);
  }

  function _resolverAcesso() {
    return supabaseClient.rpc('meu_acesso').then(function (res) {
      if (res.error || !res.data || res.data.length === 0) {
        _mostrarNegado();
        return false;
      }
      window.meuAcesso = res.data[0];
      var overlay = _el('auth-overlay');
      if (overlay) overlay.remove();
      _fire();
      return true;
    });
  }

  function _init() {
    _injectOverlay();
    supabaseClient.auth.getSession().then(function (res) {
      var session = res.data && res.data.session;
      if (session) {
        _resolverAcesso();
      }
      // se não há sessão, o overlay de login (já injetado) permanece visível
    });

    supabaseClient.auth.onAuthStateChange(function (event, session) {
      if (event === 'SIGNED_IN' && session) {
        _resolverAcesso();
      }
      if (event === 'SIGNED_OUT') {
        window.location.reload();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', _init);
})();
