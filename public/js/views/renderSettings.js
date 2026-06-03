export function renderSettings(state) {
  const clientField = document.getElementById('clientId');
  const secretField = document.getElementById('clientSecret');
  const geminiField = document.getElementById('geminiApiKey');
  const openaiField = document.getElementById('openaiApiKey');
  const anthropicField = document.getElementById('anthropicApiKey');
  const providerField = document.getElementById('aiProvider');

  if (clientField && state.config.clientId) clientField.value = state.config.clientId;
  if (secretField && state.config.clientSecret) secretField.value = state.config.clientSecret;
  if (geminiField && state.config.geminiApiKey) geminiField.value = state.config.geminiApiKey;
  if (openaiField && state.config.openaiApiKey) openaiField.value = state.config.openaiApiKey;
  if (anthropicField && state.config.anthropicApiKey) anthropicField.value = state.config.anthropicApiKey;
  if (providerField && state.config.aiProvider) providerField.value = state.config.aiProvider;

  const connGlow = document.getElementById('connectionGlow');
  const connTitle = document.getElementById('connectionStatusTitle');
  const connDesc = document.getElementById('connectionStatusDesc');
  const connBtn = document.getElementById('connectGmailBtn');
  const disconnBtn = document.getElementById('disconnectGmailBtn');
  const alertBanner = document.getElementById('connectionAlert');

  if (state.config.isConnected) {
    connGlow.className = 'status-glow-icon connected';
    connGlow.innerHTML = '<i class="fa-solid fa-square-check"></i>';
    connTitle.textContent = 'Gmail Account Connected';
    connDesc.textContent = `Connected as: ${state.config.userEmail}`;
    connBtn.classList.add('hidden');
    disconnBtn.classList.remove('hidden');
    alertBanner.classList.add('hidden');
  } else {
    connGlow.className = 'status-glow-icon disconnected';
    connGlow.innerHTML = '<i class="fa-solid fa-plug"></i>';
    connTitle.textContent = 'Disconnected';
    connDesc.textContent = 'Action required: connect Google OAuth to sync and send live email replies.';
    connBtn.classList.remove('hidden');
    disconnBtn.classList.add('hidden');
    alertBanner.classList.remove('hidden');
  }

  if (state.preferences) {
    document.getElementById('defaultTone').value = state.preferences.defaultTone;
    document.getElementById('customInstructions').value = state.preferences.customInstructions;
    document.getElementById('signature').value = state.preferences.signature;
  }

  const providerSelect = document.getElementById('aiProvider');
  const geminiGroup = document.getElementById('geminiKeyGroup');
  const openaiGroup = document.getElementById('openaiKeyGroup');
  const anthropicGroup = document.getElementById('anthropicKeyGroup');

  if (providerSelect) {
    const val = providerSelect.value;
    if (geminiGroup) geminiGroup.style.display = val === 'gemini' ? 'block' : 'none';
    if (openaiGroup) openaiGroup.style.display = val === 'openai' ? 'block' : 'none';
    if (anthropicGroup) anthropicGroup.style.display = val === 'anthropic' ? 'block' : 'none';
  }
}
