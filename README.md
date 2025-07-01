# Prompt DJ: Real-time AI Music Generation

**Prompt DJ** is an interactive web application that allows you to generate and control music in real-time using text prompts. Powered by Google's advanced Lyria model for music generation, this tool provides a hands-on, DJ-like experience for shaping audio landscapes on the fly. Adjust prompt weights, tweak generation parameters, and mix styles to create unique, evolving soundscapes.

---

## Gallery

The interface features a dynamic, retro-terminal aesthetic with multiple selectable themes.

| Matrix Green                                                                                                  | Neon Pink                                                                                                   |
| :------------------------------------------------------------------------------------------------------------ | :---------------------------------------------------------------------------------------------------------- |
| ![Matrix Green Theme](https://github.com/user-attachments/assets/3003c382-85f6-41f6-9c1e-7f518c86fa11) | ![Neon Pink Theme](https://github.com/user-attachments/assets/063eadc3-08ab-4e0a-af5d-f2357bf0d5ee) |
| **Red Alert** | **DOS** |
| ![Red Alert Theme](https://github.com/user-attachments/assets/cd2ea406-49eb-4033-9df8-5e34411284dc)  | ![DOS Theme](https://github.com/user-attachments/assets/7182f55a-167a-4491-bea6-dbecf2ae6d1b)       |

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
* A Google Generative AI API key needs to be present in a .env file in the root webapp directory.
* (Recommended) Windows 10/11 with WSL2 (Windows Subsystem for Linux) installed.

### 2. Clone the Repository

Clone the project to your local machine.

```bash
git clone [https://github.com/Olti81/dj.git](https://github.com/Olti81/dj.git)
cd prompt-dj
