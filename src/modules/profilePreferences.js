const { preferencesRepo } = require('../database/repositories');

const profilePreferences = {
  getStyleProfile() {
    const preferences = preferencesRepo.get();
    return preferences.styleProfile;
  },

  getPreferences() {
    return preferencesRepo.get();
  },

  async savePreferences(updates) {
    const { defaultTone, signature, customInstructions } = updates;
    const preferences = preferencesRepo.get();

    if (defaultTone) preferences.defaultTone = defaultTone;
    if (signature !== undefined) preferences.signature = signature;
    if (customInstructions !== undefined) preferences.customInstructions = customInstructions;

    return preferencesRepo.save(preferences);
  }
};

module.exports = profilePreferences;
