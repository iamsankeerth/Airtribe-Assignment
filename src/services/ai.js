const { GoogleGenerativeAI } = require('@google/generative-ai');
const { OpenAI } = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const db = require('../database/db');

class AIService {
  getUserDisplayName() {
    return 'Sankeerth Masetty';
  }

  // Helper to extract first name for friendly greeting
  getSenderFirstName(senderStr) {
    if (!senderStr) return 'there';
    // Match "Name <email>" format
    const namePart = senderStr.split('<')[0].trim();
    if (namePart) {
      // Split name by space and return first word
      const words = namePart.replace(/["']/g, '').split(' ');
      return words[0] || 'there';
    }
    return 'there';
  }

  // Local fallback reply generator when Gemini is unavailable
  generateFallbackReply(email, tone, preferences, styleProfile) {
    const userDisplayName = this.getUserDisplayName();
    const senderName = this.getSenderFirstName(email.sender);
    const signature = preferences.signature ? `\n\n--\n${preferences.signature}` : '';
    const subject = email.subject || '';
    
    // Check style profile common phrases to inject if available
    let openingPhrase = 'I hope you are doing well.';
    let closingPhrase = 'Best regards,';

    if (styleProfile && styleProfile.commonPhrases && styleProfile.commonPhrases.length > 0) {
      openingPhrase = styleProfile.commonPhrases[0];
      if (styleProfile.commonPhrases.length > 1) {
        closingPhrase = styleProfile.commonPhrases[1];
      }
    }

    let bodyText = '';

    // Generate response content depending on the subject matter and tone requested
    if (subject.includes('Partnership') || subject.includes('BrightScale')) {
      if (tone === 'Concise') {
        bodyText = `Hi ${senderName},\n\nThanks for reaching out! I'm interested in discussing a partnership.\n\nThursday at 3:00 PM EST works for me. Let's connect then. Please send over an invitation.\n\n${closingPhrase}\n${userDisplayName}${signature}`;
      } else if (tone === 'Friendly') {
        bodyText = `Hey ${senderName}!\n\nIt's great to hear from you. I really appreciate you following our launch and the kind words about our AI work!\n\nA partnership sounds exciting. Thursday at 3:00 PM EST is perfect for a quick 15-minute call. Feel free to send a calendar invite and I'll see you then!\n\nCheers,\n${userDisplayName}${signature}`;
      } else if (tone === 'Formal') {
        bodyText = `Dear ${senderName},\n\nThank you for your inquiry regarding a potential partnership with our company.\n\nWe would be pleased to schedule an introductory call to discuss how our AI solutions might integrate with BrightScale. I am available this coming Thursday at 3:00 PM EST as proposed.\n\nPlease send a formal calendar invitation to coordinate the meeting.\n\n${closingPhrase}\nOperations Team${signature}`;
      } else { // Custom/Empathetic/Urgent
        bodyText = `Hi ${senderName},\n\nThank you for reaching out and for your warm feedback on our AI systems. Your team's needs at BrightScale align closely with what we solve.\n\nI will absolutely make time for a 15-minute call this Thursday at 3:00 PM EST. Looking forward to discussing this in detail.\n\n${closingPhrase}\n${userDisplayName}${signature}`;
      }
    } else if (subject.includes('pricing') || subject.includes('Enterprise')) {
      if (tone === 'Concise') {
        bodyText = `Hi ${senderName},\n\nThanks for evaluating Draftly. Yes, we support custom SLA agreements, private VPC hosting, and custom security reviews.\n\nI've attached our Enterprise pricing sheet. Let's schedule a call to review your team's exact requirements.\n\n${closingPhrase}\n${userDisplayName}${signature}`;
      } else if (tone === 'Friendly') {
        bodyText = `Hey ${senderName},\n\nThanks so much for checking out Draftly for your support team! 45 agents is a fantastic scale.\n\nTo answer your questions: Yes, yes, and yes! We fully support custom SLAs, private AWS VPC deployments, and we'd be glad to participate in your IT security review.\n\nAttached is our pricing sheet. Let's get a call scheduled next week to set up a dedicated trial for your team!\n\nCheers,\n${userDisplayName}${signature}`;
      } else if (tone === 'Formal') {
        bodyText = `Dear ${senderName},\n\nThank you for considering Draftly for your IT support division of 45 agents.\n\nIn response to your technical requirements, I am pleased to confirm that we support custom Service Level Agreements (SLAs), hosting within private AWS Virtual Private Clouds (VPCs), and comprehensive vendor security reviews.\n\nI have attached our Enterprise Pricing details. Please advise on your availability next week for an in-depth technical consultation.\n\n${closingPhrase}\nEnterprise Sales Team${signature}`;
      } else {
        bodyText = `Hi ${senderName},\n\nThank you for reaching out to us. We understand that deploying enterprise software requires high reliability and compliance.\n\nWe support private VPC deployments, custom security reviews, and custom SLA terms to fit TechCorp's IT standards. Let's set up a dedicated evaluation environment for your team so you can test it thoroughly.\n\n${closingPhrase}\nSolutions Architecture Team${signature}`;
      }
    } else if (subject.includes('coffee') || subject.includes('David')) {
      if (tone === 'Concise') {
        bodyText = `Hey David,\n\nGreat to hear from you! I'd love to catch up.\n\nWednesday at 12:30 PM for lunch works best for me. Let me know if that fits your schedule!\n\nCheers,\n${userDisplayName}${signature}`;
      } else if (tone === 'Friendly') {
        bodyText = `Hey David!\n\nOh man, it really has been ages! I would absolutely love to grab a coffee and catch up. Awesome that you're in town!\n\nNext Wednesday works perfect for me. Let's grab lunch around 12:30 PM? Let me know where you're staying and we can pick a spot nearby.\n\nCan't wait to catch up!\nCheers,\n${userDisplayName}${signature}`;
      } else if (tone === 'Formal') {
        bodyText = `Dear David,\n\nThank you for reaching out. I would be pleased to meet with you next week during your visit to the city.\n\nI am available next Wednesday at 12:30 PM for a luncheon. Please let me know if this timing is compatible with your itinerary.\n\nSincerely,\n${userDisplayName}${signature}`;
      } else {
        bodyText = `Hey David,\n\nIt's great to hear from you. Next week sounds fantastic. I'd love to catch up and talk shop.\n\nI'm free Wednesday afternoon or Thursday morning. Let's grab a coffee and see what you've been working on!\n\nTalk soon,\n${userDisplayName}${signature}`;
      }
    } else if (subject.includes('Latency') || subject.includes('WARNING') || subject.includes('Timeout') || subject.includes('Bug')) {
      if (tone === 'Concise') {
        bodyText = `Hi ${senderName},\n\nThanks for the alert. We have acknowledged the issue and our infrastructure team is currently checking AWS API Gateway logs and database read queues.\n\nUpdates to follow shortly.\n\n${closingPhrase}\nDevOps${signature}`;
      } else if (tone === 'Friendly') {
        bodyText = `Hey ${senderName},\n\nAppreciate you flagging this bug so quickly!\n\nOur team is on it—we're actively checking the AWS CloudWatch metrics and spinning up additional API replicas to handle the latency peaks. Will ping you as soon as the response times stabilize!\n\nThanks for keeping our systems safe!\nCheers,\nDevOps${signature}`;
      } else if (tone === 'Formal') {
        bodyText = `Dear ${senderName},\n\nWe acknowledge receipt of the system warning regarding API latency spikes.\n\nOur engineering team has been dispatched to audit active Lambda executions and verify database query optimization. We will issue an official incident report once the performance reaches baseline levels.\n\nRespectfully,\nSystems Reliability Team${signature}`;
      } else {
        bodyText = `Hi ${senderName},\n\nThank you for raising this issue. We take database and API availability extremely seriously.\n\nOur standby engineers are currently inspecting the query log for timeouts and will resolve the incident shortly. We apologize for any inconvenience caused.\n\n${closingPhrase}\nSupport Team${signature}`;
      }
    } else {
      // General fallbacks
      if (tone === 'Concise') {
        bodyText = `Hi ${senderName},\n\nThank you for your email. I have received it and am looking into the details.\n\nI will follow up with you as soon as I have a concrete update.\n\n${closingPhrase}\n${userDisplayName}${signature}`;
      } else if (tone === 'Friendly') {
        bodyText = `Hey ${senderName}!\n\nThanks so much for reaching out. ${openingPhrase}\n\nI'm reviewing your email right now and will get back to you with the details shortly. Hope you have a wonderful day!\n\nCheers,\n${userDisplayName}${signature}`;
      } else if (tone === 'Formal') {
        bodyText = `Dear ${senderName},\n\nThank you for your message. ${openingPhrase}\n\nI am currently reviewing the information you provided and will issue a formal response in due course.\n\n${closingPhrase}\n${userDisplayName}${signature}`;
      } else {
        bodyText = `Hi ${senderName},\n\nThank you for writing. I appreciate your input and will review this with my team.\n\nWe'll be in touch with next steps shortly.\n\n${closingPhrase}\n${userDisplayName}${signature}`;
      }
    }

    return bodyText;
  }

  async generateDraft(email, tone = 'Concise') {
    const preferences = db.get('preferences');
    const styleProfile = preferences.styleProfile || {};
    const creds = db.get('credentials') || {};
    const provider = (creds.aiProvider || 'gemini').toLowerCase().trim();
    
    await db.log('AI', 'Info', `Requesting AI draft generation for Subject: "${email.subject}" using Provider: "${provider}" with Tone: ${tone}`);

    // Retrieve the entire chronological conversation history for this thread from local DB
    const threadEmails = db.findAll('emails')
      .filter(e => e.threadId === email.threadId)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    let threadHistoryPrompt = '';
    const userEmail = (creds.userEmail || '').toLowerCase().trim();
    
    if (threadEmails.length > 0) {
      threadHistoryPrompt = threadEmails.map((te, idx) => {
        const isSelf = userEmail && te.sender.toLowerCase().includes(userEmail);
        const role = isSelf ? 'USER (You)' : 'SENDER';
        
        // COLLAPSE & CLEAN HTML/WHITESPACE FOR HIGH TOKEN DENSITY
        const cleanBody = te.body
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove CSS blocks
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove JS blocks
          .replace(/<[^>]*>/g, ' ') // Strip HTML tags
          .replace(/\s+/g, ' ') // Collapse whitespaces
          .trim()
          .substring(0, 1200); // Truncate safely to keep prompt highly dense
          
        return `[Message #${idx + 1}]
Role: ${role}
From: ${te.sender}
Subject: ${te.subject}
Date: ${te.timestamp}
Content:
"""
${cleanBody}
"""`;
      }).join('\n\n');
    } else {
      // Fallback if somehow thread is missing
      const cleanBody = email.body
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 1500);
      threadHistoryPrompt = `Single Email Content:\n"""\n${cleanBody}\n"""`;
    }

    // Build comprehensive prompt injecting thread history, instructions, style profile, and signatures
    const prompt = `
You are an intelligent email writing assistant. Your task is to draft a reply to an incoming email on behalf of the user.

USER PREFERENCES:
- Default instructions: "${preferences.customInstructions || 'None'}"
- Signature: "${preferences.signature || ''}"

LEARNED WRITING STYLE PROFILE:
- Style Overview: ${styleProfile.summary || 'Write standard professional replies.'}
- Common Openings/Phrases to mimic: ${JSON.stringify(styleProfile.commonPhrases || [])}
- Sentence structure preference: ${styleProfile.sentenceLength || 'moderate'}

CONVERSATION THREAD HISTORY (Chronological, oldest first):
${threadHistoryPrompt}

DRAFT SPECIFICATION:
- Requested Tone: ${tone} (e.g. Concise = short, fast, direct; Friendly = warm, enthusiastic, uses emojis; Formal = professional, detailed, respectful, uses salutations; Custom = empathetic and supportive).
- Thread context: You are replying directly to the LATEST message in the above conversation thread history. Keep thread continuity. 
- DO NOT invent facts or make up details that are not in the email, except to confirm availability or standard schedules.
- Address the sender naturally. If their name is in the Sender field, address them by first name (unless Formal tone is requested, where you should use their title and last name or "Dear [First Name]").
- Do not repeat the subject line. Just output the body of the email.
- Append the signature at the end: "${preferences.signature || ''}" (but make sure it fits the tone, prepended with appropriate spacing or "--").

Draft the email reply now:
`;

    // 1. OpenAI Integration
    if (provider === 'openai') {
      if (!creds.openaiApiKey) {
        await db.log('AI', 'Warning', 'OpenAI API key is missing. Using local fallback draft generation.');
        return this.generateFallbackReply(email, tone, preferences, styleProfile);
      }
      try {
        await db.log('AI', 'Info', 'Initializing OpenAI engine...');
        const openai = new OpenAI({ apiKey: creds.openaiApiKey });
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }]
        });
        const responseText = completion.choices[0].message.content;
        await db.log('AI', 'Info', `OpenAI response received successfully (length: ${responseText.length} chars).`);
        return responseText.trim();
      } catch (err) {
        await db.log('AI', 'Error', `OpenAI AI Generation failed: ${err.message}. Falling back to local heuristic model...`);
        return this.generateFallbackReply(email, tone, preferences, styleProfile);
      }
    }

    // 2. Anthropic (Claude) Integration
    if (provider === 'anthropic') {
      if (!creds.anthropicApiKey) {
        await db.log('AI', 'Warning', 'Anthropic API key is missing. Using local fallback draft generation.');
        return this.generateFallbackReply(email, tone, preferences, styleProfile);
      }
      try {
        await db.log('AI', 'Info', 'Initializing Anthropic Claude engine...');
        const anthropic = new Anthropic({ apiKey: creds.anthropicApiKey });
        const msg = await anthropic.messages.create({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }]
        });
        const responseText = msg.content[0].text;
        await db.log('AI', 'Info', `Anthropic response received successfully (length: ${responseText.length} chars).`);
        return responseText.trim();
      } catch (err) {
        await db.log('AI', 'Error', `Anthropic AI Generation failed: ${err.message}. Falling back to local heuristic model...`);
        return this.generateFallbackReply(email, tone, preferences, styleProfile);
      }
    }

    // 3. Gemini (Default) Integration
    if (!creds.geminiApiKey) {
      await db.log('AI', 'Warning', 'Gemini API key is missing. Using local fallback draft generation.');
      return this.generateFallbackReply(email, tone, preferences, styleProfile);
    }

    try {
      await db.log('AI', 'Info', 'Initializing Gemini Generative AI engine...');
      const genAI = new GoogleGenerativeAI(creds.geminiApiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      await db.log('AI', 'Info', `Gemini response received successfully (length: ${responseText.length} chars).`);
      return responseText.trim();
    } catch (err) {
      await db.log('AI', 'Error', `Gemini AI Generation failed: ${err.message}. Falling back to local heuristic model...`);
      return this.generateFallbackReply(email, tone, preferences, styleProfile);
    }
  }
}

module.exports = new AIService();
