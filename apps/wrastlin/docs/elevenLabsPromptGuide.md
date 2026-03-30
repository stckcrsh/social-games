# ElevenLabs v3 Multi-Voice Dialogue Best Practices (Agent Context)

## Purpose
These guidelines help an AI agent generate dialogue scripts optimized for **ElevenLabs v3 Text-to-Speech** when producing **multi-speaker conversations**. The goal is to produce text that results in natural, expressive speech with consistent voice performance.

---

# Core Dialogue Rules

## 1. Clearly Label Speakers
Each line of dialogue must clearly indicate the speaker so the system can map lines to the correct voice.

Preferred format:

SpeakerName: dialogue line

Example:

Announcer: Welcome back to the arena.  
Wrestler A: You think you're ready for tonight?  
Wrestler B: I've been ready for years.

---

## 2. Keep Segments Short
Large blocks of text can degrade voice consistency.

Best practice:

- Keep generated text **under ~800–900 characters per segment**
- Split long scenes into multiple dialogue segments
- Maintain logical conversational boundaries when splitting

---

## 3. Write Natural Spoken Language
Text should resemble how people actually speak.

Good:

I don't think that's going to work.

Bad:

I do not believe that strategy will succeed.

Natural speech improves rhythm, emotion, and pacing in generated audio.

---

# Text Formatting Rules

## 4. Normalize Text
Avoid symbols or formatting that can confuse pronunciation.

Guidelines:

- Spell out numbers when needed
- Avoid symbols such as @, %, $, etc.
- Use normal punctuation

Example:

Bad: Meet me @ 5pm  
Good: Meet me at five PM

---

## 5. Use Punctuation for Timing
The model interprets punctuation as performance cues.

Examples:

...   → hesitation or trailing thought  
!     → excitement  
?     → questioning tone  
—     → interruption or sudden thought

Example:

Wait... you actually did that?

---

# Expressive Voice Control

## 6. Use Audio Direction Tags
Inline tags can influence delivery.

Common tags:

[laughs]  
[sighs]  
[whispers]  
[gasps]

Example:

Hero: I told you this would happen.  
Sidekick: [sighs] I know... I know.

These act like stage directions for the voice model.

---

# Multi-Speaker Conversation Guidelines

## 7. Maintain Character Voice Consistency
Each speaker should have a consistent speaking style.

Examples:

Hero  
- confident  
- direct  
- determined

Villain  
- dramatic  
- slower pacing  
- taunting tone

Sidekick  
- nervous  
- reactive  
- casual speech

Writing style helps reinforce vocal personality.

---

## 8. Favor Short Turn-Taking
Natural dialogue alternates speakers frequently.

Preferred structure:

Speaker A: short line  
Speaker B: short response  
Speaker A: reaction  

Avoid long monologues unless intentionally dramatic.

---

## 9. Provide Emotional Context
The model infers emotion from surrounding text.

Example:

Neutral:  
I can't believe you did that.

Better:  
I can't believe you did that... after everything we've been through.

More context improves emotional delivery.

---

# Recommended Generation Workflow

1. Write dialogue as a script with labeled speakers
2. Keep each script segment under 900 characters
3. Include punctuation and emotional cues
4. Add stage-direction tags when helpful
5. Generate speech per segment
6. Combine generated audio segments into a full scene

---

# Example Multi-Voice Script

Announcer: Ladies and gentlemen, welcome back to the arena.

Wrestler A: You think you're ready for tonight?

Wrestler B: [laughs] Ready? I've been waiting for this moment for years.

Wrestler A: Then step into the ring and prove it.

---

# Key Principles for Agents

When generating dialogue for ElevenLabs v3:

- Write **natural spoken dialogue**
- **Label each speaker clearly**
- Keep text **under 900 characters per generation**
- Use **punctuation for pacing**
- Use **audio tags for emotional cues**
- Maintain **distinct character speaking styles**
- Prefer **short conversational exchanges**