export function renderStyleProfile(styleProfile) {
  const summaryText = document.getElementById('profileSummaryText');
  const metricsGrid = document.getElementById('styleMetricsGrid');

  if (!styleProfile || !styleProfile.summary) {
    summaryText.textContent = 'Writing style profile has not been trained yet. Click below to analyze sent historical outbox messages.';
    metricsGrid.innerHTML = '';
    return;
  }

  summaryText.textContent = styleProfile.summary;
  metricsGrid.innerHTML = `
    <div class="metric-bar-group">
      <div class="metric-header">
        <span>Formal Styling</span>
        <span class="metric-value">${styleProfile.toneDistribution.formal}%</span>
      </div>
      <div class="metric-track">
        <div class="metric-fill" style="width: ${styleProfile.toneDistribution.formal}%"></div>
      </div>
    </div>
    <div class="metric-bar-group">
      <div class="metric-header">
        <span>Friendly & Casual</span>
        <span class="metric-value">${styleProfile.toneDistribution.friendly}%</span>
      </div>
      <div class="metric-track">
        <div class="metric-fill" style="width: ${styleProfile.toneDistribution.friendly}%"></div>
      </div>
    </div>
    <div class="metric-bar-group">
      <div class="metric-header">
        <span>Brief & Concise</span>
        <span class="metric-value">${styleProfile.toneDistribution.concise}%</span>
      </div>
      <div class="metric-track">
        <div class="metric-fill" style="width: ${styleProfile.toneDistribution.concise}%"></div>
      </div>
    </div>
    <div class="style-metrics" style="margin-top: 0.5rem; font-size: 0.75rem; border-top: 1px solid rgba(255,255,255,0.03); padding-top: 0.5rem; gap: 0.35rem;">
      <div><strong>Sentence length:</strong> <span style="color: var(--text-primary);">${styleProfile.sentenceLength}</span></div>
      <div><strong>Signature pattern:</strong> <span style="color: var(--text-primary);">${styleProfile.signatureStyle}</span></div>
      <div style="display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.35rem;">
        <strong>Common triggers:</strong>
        ${(styleProfile.commonPhrases || []).map(phrase => `<span style="background: rgba(157,78,221,0.15); border: 1px solid rgba(157,78,221,0.25); color: var(--primary); padding: 0.1rem 0.35rem; border-radius: 4px; font-size: 0.65rem;">"${phrase}"</span>`).join('')}
      </div>
    </div>
  `;
}
