# Prompt DJ: Real-time AI Music Generation

**Prompt DJ** is an interactive web application that allows you to generate and control music in real-time using text prompts. Powered by Google's advanced Lyria model for music generation, this tool provides a hands-on, DJ-like experience for shaping audio landscapes on the fly. Adjust prompt weights, tweak generation parameters, and mix styles to create unique, evolving soundscapes.

---

## Gallery

The interface features a dynamic, retro-terminal aesthetic with multiple selectable themes.

---

## Core Features

* **Real-time Music Generation**: Utilizes the `lyria-realtime-exp` model via the Google Generative AI API to generate a continuous stream of music.
* **Multi-Prompt Control**: Use up to 16 simultaneous text prompts to define the musical style.
* **Dynamic Weighting**: Adjust the influence of each prompt in real-time using interactive knobs to smoothly transition between styles.
* **Parameter Tuning**: Fine-tune the AI's output with core settings (Temperature, Guidance, Top-K) and advanced parameters (BPM, Scale, Instrument Muting).
* **Preset Management**: Save, load, and delete entire sets of prompts as named presets, storing them in the browser's local storage.
* **Theming**: Customize the look and feel of the interface with multiple built-in color themes.
* **Audio Download**: Record the live-generated audio and download it as a `.wav` file.
* **Responsive UI**: The layout is designed to be usable across different screen sizes.

---

## Tech Stack

* **Frontend**: Built with **Lit** (a simple library for building fast, lightweight web components) and **TypeScript**.
* **AI Model**: **Google Generative AI** (Gemini API with the Lyria model).
* **Audio Playback**: Standard **Web Audio API** for low-latency audio scheduling and playback.

---

## Setup and Installation

To run this project locally, follow these steps:

### 1. Prerequisites

* Node.js and npm (or yarn) installed.
* A Google Generative AI API key.

### 2. Clone the Repository

```bash
git clone <your-repository-url>
cd <repository-directory>