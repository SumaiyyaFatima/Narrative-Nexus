# Narrative Nexus

An AI-powered multimedia storytelling system that transforms a single user prompt into a fully narrated storybook-style video with consistent visuals, structured storytelling, and synchronized audio.

---

## Overview

Narrative Nexus is an end-to-end AI storytelling pipeline designed to automate the creation of multimedia narratives. The system generates a complete story, extracts structured scene descriptions, creates scene-specific illustrations, and assembles them into a narrated video.

Unlike traditional AI tools that focus only on text generation or image synthesis, Narrative Nexus integrates multiple AI models into a unified workflow that ensures narrative coherence, character consistency, and visual continuity across scenes.

---

## Key Features

* Prompt-to-video storytelling pipeline
* AI-generated multi-scene narratives
* Structured scene extraction and decomposition
* Character consistency enforcement across scenes
* Anti-repetition scene prompting
* Diffusion-based image generation
* Automated narration using Text-to-Speech
* Video generation with synchronized audio
* Real-time progress updates using Server-Sent Events (SSE)
* Interactive React-based user interface

---

## System Architecture

```text
User Prompt
     ↓
LLaMA 3.3-70B (Story Generation)
     ↓
Qwen 2.5-15B-Instruct (Scene Extraction)
     ↓
Stable Diffusion DreamShaper-8 (Image Generation)
     ↓
gTTS (Narration Generation)
     ↓
MoviePy (Video Assembly)
     ↓
Final Story Video
```

---

## Technologies Used

### Frontend

* React.js
* JavaScript
* HTML5
* CSS3

### Backend

* Flask
* Python

### AI Models

* LLaMA 3.3-70B (via Groq API)
* Qwen 2.5-15B-Instruct
* Stable Diffusion DreamShaper-8

### Multimedia Processing

* gTTS
* MoviePy

---

## Methodology

### Story Generation

A user prompt and selected storytelling tone are processed using LLaMA 3.3-70B through the Groq API to generate a structured narrative with a clear protagonist, setting, and sequential storyline.

### Scene Extraction

Qwen 2.5-15B-Instruct converts the generated story into structured scene descriptions while extracting:

* Characters
* Locations
* Actions
* Emotional context

### Character Consistency

A character-lock mechanism preserves detailed character descriptions across scenes to maintain visual continuity throughout the narrative.

### Image Generation

Stable Diffusion DreamShaper-8 generates scene-specific illustrations from structured prompts while enforcing style consistency and reducing repetitive outputs.

### Video Generation

Generated visuals are assembled into a video sequence with motion effects. Narration is generated using gTTS and synchronized with scene timing to create an immersive storytelling experience.

---

## Screenshots

### Home Page

![Home Page](assets/screenshots/home-page.png)

### Story Generation

![Story Generation](assets/screenshots/story-generation.png)

### Generated Scenes

![Generated Scenes](assets/screenshots/generated-scenes.png)

### Final Video Output

![Final Video](assets/screenshots/final-video.png)

---

## Demo Video

Watch the project demonstration here:

[Demo Video](PASTE_YOUR_YOUTUBE_OR_DRIVE_LINK_HERE)

---

## Project Structure

```text
Narrative-Nexus/
│
├── app.py
├── Step4_Colab_UPDATED.ipynb
├── narrative-nexus-ui/
│   ├── src/
│   ├── public/
│   └── package.json
│
├── assets/
│   └── screenshots/
│
└── README.md
```

---

## Applications

* Creative Content Generation
* Educational Storytelling
* Entertainment and Media Production
* Storyboarding and Pre-Visualization
* Game Development
* Digital Marketing and Advertising
* Interactive Storytelling Platforms
* Future AR/VR Storytelling Experiences

---

## Future Enhancements

* Improved multi-character consistency
* Longer and more complex narrative generation
* Real-time video generation
* User authentication and story storage
* Cloud deployment
* Interactive storytelling experiences
* AR/VR integration

---

## Author

**Sumaiyya Fatima**

Bachelor's Major Project

AI-Powered Multimedia Storytelling System
