const replyDraftGenerator = require('./replyDraftGenerator');
const styleProfileLearner = require('./styleProfileLearner');

module.exports = {
  generateReplyDraft: replyDraftGenerator.generateReplyDraft,
  learnStyleProfile: styleProfileLearner.learnStyleProfile
};
