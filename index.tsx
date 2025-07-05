/**
 * @fileoverview Control real time music with text prompts
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {css, CSSResultGroup, html, LitElement, svg} from 'lit';
import {customElement, property, query, state} from 'lit/decorators.js';
import {classMap} from 'lit/directives/class-map.js';
import {styleMap} from 'lit/directives/style-map.js';
import {repeat} from 'lit/directives/repeat.js';

import {
  GoogleGenAI,
  type LiveMusicGenerationConfig,
  type LiveMusicServerMessage,
  type LiveMusicSession,
} from '@google/genai';
import {audioBufferToWav, decode, decodeAudioData} from './utils';
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  apiVersion: 'v1alpha',
});
let model = 'lyria-realtime-exp';

interface Prompt {
  readonly promptId: string;
  readonly color: string;
  text: string;
  weight: number;
}

type PlaybackState = 'stopped' | 'playing' | 'loading' | 'paused';

interface Preset {
  name: string;
  prompts: Prompt[];
}

function getStoredPresets(): Map<string, Preset> {
  const {localStorage} = window;
  const storedPresets = localStorage.getItem('presets');

  if (storedPresets) {
    try {
      const presetsArray = JSON.parse(storedPresets) as Preset[];
      return new Map(presetsArray.map((preset) => [preset.name, preset]));
    } catch (e) {
      console.error('Failed to parse stored presets', e);
    }
  }
  return new Map();
}

function setStoredPresets(presets: Map<string, Preset>) {
  const presetsArray = Array.from(presets.values());
  const {localStorage} = window;
  localStorage.setItem('presets', JSON.stringify(presetsArray));
}

/** Throttles a callback to be called at most once per `freq` milliseconds. */
function throttle(func: (...args: unknown[]) => void, delay: number) {
  let lastCall = 0;
  return (...args: unknown[]) => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;
    if (timeSinceLastCall >= delay) {
      func(...args);
      lastCall = now;
    }
  };
}

const PROMPT_TEXT_PRESETS = [
  'Minimal Techno',
  'Drum and Bass',
  'Post Punk',
  'Funk',
  'Chiptune',
  'Punchy Kick',
  'Dubstep',
  'Trip Hop',
  'Ambient',
  'House',
  'Trance',
  'Reggae',
  'Jazz Fusion',
  'Industrial',
  'Synthwave',
  'Lo-fi Hip Hop',
  'Gothic Rock',
  'IDM',
  '808 Bass',
  'Distorted Guitar',
  'Saxophone Solo',
  'Orchestral Strings',
  'Wobbly Bass',
  'Piano Melody',
  'Melancholic',
  'Euphoric',
  'Aggressive',
  'Serene',
  'Glitch',
  'Breakbeat',
  'Hardcore',
  'Gabber',
  'UK Garage',
  'Psytrance',
  'Downtempo',
  'Vaporwave',
  'Darkwave',
  'EBM',
  'Future Bass',
  'Trap',
  'Drill',
  'Flute Lead',
  'Harp Arpeggios',
  'Sitar Riffs',
  'Theremin Wail',
  'Moog Bassline',
  'Didgeridoo Drone',
  'Steel Drums',
  'Hypnotic Rhythm',
  'Nostalgic Melody',
  'Energetic Beat',
  'Dreamy Atmosphere',
  'Chaotic Percussion',
  'Acid House',
  'Jungle',
  'Hardstyle',
  'Dub Techno',
  'Electro Swing',
  'Future Garage',
  'Witch House',
  'Chillwave',
  'Post-Rock',
  'Noise Rock',
  'Death Metal',
  'Black Metal',
  'Ska',
  'Reggaeton',
  'Afrobeat',
  'Footwork',
  'Grime',
  'Phonk',
  'Hyperpop',
  'Spoken Word',
  'Accordion',
  'Bagpipes',
  'Banjo',
  'Cello',
  'Clarinet',
  'Double Bass',
  'French Horn',
  'Glockenspiel',
  'Mandolin',
  'Oboe',
  'Tabla',
  'Trombone',
  'Tuba',
  'Ukulele',
  'Vibraphone',
  'Anxious',
  'Chaotic',
  'Cinematic',
  'Cosmic',
  'Cybernetic',
  'Dark',
  'Epic',
  'Futuristic',
  'Glorious',
  'Mysterious',
  'Peaceful',
  'Robotic',
  'Spiritual',
  'Suspenseful',
  'Uplifting',
];

const COLORS = [
  '#9900ff',
  '#5200ff',
  '#ff25f6',
  '#2af6de',
  '#ffdd28',
  '#3dffab',
  '#d8ff3e',
  '#d9b2ff',
];

function getUnusedRandomColor(usedColors: string[]): string {
  const availableColors = COLORS.filter((c) => !usedColors.includes(c));
  if (availableColors.length === 0) {
    // If no available colors, pick a random one from the original list.
    return COLORS[Math.floor(Math.random() * COLORS.length)];
  }
  return availableColors[Math.floor(Math.random() * availableColors.length)];
}

// WeightSlider component
// -----------------------------------------------------------------------------
/** A slider for adjusting and visualizing prompt weight. */
@customElement('weight-slider')
class WeightSlider extends LitElement {
  static override styles = css`
    :host {
      cursor: grab;
      position: relative;
      display: flex;
      flex-direction: column; /* Arrange children vertically */
      justify-content: space-between; /* Push knob to top, value to bottom */
      align-items: center;
      width: 100%;
      height: 100%;
      min-height: 8vmin;
      padding-bottom: 0.8vmin; /* Add padding for the value display */
    }
    .knob-container {
      position: relative;
      width: 80%;
      padding-bottom: 80%; /* Aspect ratio 1:1 */
      display: flex;
      justify-content: center;
      align-items: center;
      flex-grow: 1; /* Allow knob to take available space */
    }
    svg {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      transform: rotate(-120deg); /* Start angle for knob */
    }
    .knob-bg {
      fill: var(--bg-color);
      stroke: var(--border-color);
      stroke-width: 1.6;
    }
    .knob-fill {
      fill: var(--darker-text-color);
    }
    .knob-indicator {
      fill: var(--darker-text-color);
    }
    .value-display {
      position: absolute;
      bottom: 0; /* Position at the bottom */
      left: 50%;
      transform: translateX(-50%); /* Center horizontally */
      font-size: 1.44vmin;
      color: var(--text-color);
      user-select: none;
      text-shadow: 0 0 4px var(--glow-color);
    }
  `;

  @property({type: Number}) value = 0; // Range 0-2
  @property({type: String}) color = '#000';

  private isDragging = false;
  private startAngle = 0;
  private startValue = 0;

  constructor() {
    super();
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handleWheel = this.handleWheel.bind(this);
  }

  private getAngle(clientX: number, clientY: number): number {
    const rect = this.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    return Math.atan2(clientY - centerY, clientX - centerX) * (180 / Math.PI);
  }

  private handlePointerDown(e: PointerEvent) {
    e.preventDefault();
    this.isDragging = true;
    this.startAngle = this.getAngle(e.clientX, e.clientY);
    this.startValue = this.value;
    this.style.cursor = 'grabbing';
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp, {once: true});
  }

  private handlePointerMove(e: PointerEvent) {
    if (!this.isDragging) return;
    const currentAngle = this.getAngle(e.clientX, e.clientY);
    let angleDelta = currentAngle - this.startAngle;

    // Normalize angleDelta to be within -180 to 180
    if (angleDelta > 180) angleDelta -= 360;
    if (angleDelta < -180) angleDelta += 360;

    // Map angle delta to value change (270 degrees for full range 0-2)
    // The knob rotates from -135deg (value 0) to +135deg (value 2)
    const valueChange = (angleDelta / 270) * 2;
    this.value = Math.max(0, Math.min(2, this.startValue + valueChange));
    this.dispatchInputEvent();
  }

  private handlePointerUp() {
    this.isDragging = false;
    this.style.cursor = 'grab';
    window.removeEventListener('pointermove', this.handlePointerMove);
  }

  private handleWheel(e: WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY;
    this.value = this.value + delta * -0.005;
    this.value = Math.max(0, Math.min(2, this.value));
    this.dispatchInputEvent();
  }

  private dispatchInputEvent() {
    this.dispatchEvent(new CustomEvent<number>('input', {detail: this.value}));
  }

  override render() {
    const displayValue = this.value.toFixed(2);
    // Calculate rotation for the indicator (from -135deg to +135deg, total 270deg range)
    const indicatorRotation = -135 + (this.value / 2) * 270;

    // Calculate the path for the fill based on the current value
    const startAngle = -135; // Angle for value 0
    const endAngle = indicatorRotation; // Current angle for the value

    const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;

    const getCoordinatesForAngle = (angle: number) => {
      const radians = (angle * Math.PI) / 180;
      const x = 50 + 45 * Math.cos(radians);
      const y = 50 + 45 * Math.sin(radians);
      return `${x} ${y}`;
    };

    const fillPath = `M 50 50 L ${getCoordinatesForAngle(startAngle)} A 45 45 0 ${largeArcFlag} 1 ${getCoordinatesForAngle(endAngle)} Z`;

    return html`
      <div
        class="knob-container"
        @pointerdown=${this.handlePointerDown}
        @wheel=${this.handleWheel}>
        <svg viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" class="knob-bg"></circle>
          <path class="knob-fill" d="${fillPath}"></path>
          <circle
            cx="50"
            cy="5"
            r="5"
            class="knob-indicator"
            transform="rotate(${indicatorRotation} 50 50)"
          ></circle>
        </svg>
      </div>
    `;
  }
}

// Base class for icon buttons.
class IconButton extends LitElement {
  static override styles = css`
    :host {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }
    :host(:hover) svg {
      transform: scale(1.2); /* Keep original scale for hover effect */
    }
    svg {
      width: 100%;
      height: 100%;
      transition: transform 0.5s cubic-bezier(0.25, 1.56, 0.32, 0.99);
    }
    .hitbox {
      pointer-events: all;
      position: absolute;
      width: 65%; /* Adjusted for a larger button */
      aspect-ratio: 1;
      top: 12%;   /* Adjusted for a larger button */
      border-radius: 50%;
      cursor: pointer;
    }
  ` as CSSResultGroup;

  // Method to be implemented by subclasses to provide the specific icon SVG
  protected renderIcon() {
    return svg``; // Default empty icon
  }
private renderSVG() {
  const size = 80; // Universal size. Change this one value.
  const baseSize = 112; // The original size the SVG was designed at.
  const scale = size / baseSize;

  return html` <svg
    width=${size}
    height=${size}
    viewBox="0 -${8 * scale} ${size} ${size + 8 * scale}"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect
      x=${22 * scale}
      y=${6 * scale}
      width=${96 * scale}
      height=${96 * scale}
      rx=${48 * scale}
      fill="black"
      fill-opacity="0.05"
    />
    <rect
      x=${23.5 * scale}
      y=${7.5 * scale}
      width=${93 * scale}
      height=${93 * scale}
      rx=${46.5 * scale}
      stroke="var(--border-color)"
      stroke-opacity="0.8"
      stroke-width=${3 * scale}
    />
    <g filter="url(#filter0_ddi_1048_7373)">
      <rect
        x=${25 * scale}
        y=${9 * scale}
        width=${90 * scale}
        height=${90 * scale}
        rx=${45 * scale}
        fill="var(--bg-color)"
        fill-opacity="0.05"
        shape-rendering="crispEdges"
      />
    </g>
    <g transform="scale(${scale})">${this.renderIcon()}</g>
    <defs>
      <filter
        id="filter0_ddi_1048_7373"
        x="0"
        y="0"
        width=${size}
        height=${size}
        filterUnits="userSpaceOnUse"
        color-interpolation-filters="sRGB"
      >
        <feFlood flood-opacity="0" result="BackgroundImageFix" />
        <feColorMatrix
          in="SourceAlpha"
          type="matrix"
          values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
          result="hardAlpha"
        />
        <feOffset dy="2" />
        <feGaussianBlur stdDeviation="4" />
        <feComposite in2="hardAlpha" operator="out" />
        <feColorMatrix
          type="matrix"
          values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.5 0"
        />
        <feBlend
          mode="normal"
          in2="BackgroundImageFix"
          result="effect1_dropShadow_1048_7373"
        />
        <feColorMatrix
          in="SourceAlpha"
          type="matrix"
          values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
          result="hardAlpha"
        />
        <feOffset dy="16" />
        <feGaussianBlur stdDeviation="12.5" />
        <feComposite in2="hardAlpha" operator="out" />
        <feColorMatrix
          type="matrix"
          values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.5 0"
        />
        <feBlend
          mode="normal"
          in2="effect1_dropShadow_1048_7373"
          result="effect2_dropShadow_1048_7373"
        />
        <feBlend
          mode="normal"
          in="SourceGraphic"
          in2="effect2_dropShadow_1048_7373"
          result="shape"
        />
        <feColorMatrix
          in="SourceAlpha"
          type="matrix"
          values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
          result="hardAlpha"
        />
        <feOffset dy="3" />
        <feGaussianBlur stdDeviation="1.5" />
        <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
        <feColorMatrix
          in="SourceGraphic"
          type="matrix"
          values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"
        />
        <feComponentTransfer in="SourceGraphic" result="color">
          <feFuncR type="table" tableValues="1 1" />
          <feFuncG type="table" tableValues="1 1" />
          <feFuncB type="table" tableValues="1 1" />
        </feComponentTransfer>
        <feBlend
          mode="normal"
          in2="shape"
          result="effect3_innerShadow_1048_7373"
        />
      </filter>
    </defs>
  </svg>`;
}

  override render() {
    return html`${this.renderSVG()}<div class="hitbox"></div>`;
  }
}

// PlayPauseButton
// -----------------------------------------------------------------------------

/** A button for toggling play/pause. */
@customElement('play-pause-button')
export class PlayPauseButton extends IconButton {
  @property({type: String}) playbackState: PlaybackState = 'stopped';

  static override styles = [
    IconButton.styles,
    css`
      .loader {
        stroke: #ffffff;
        stroke-width: 3;
        stroke-linecap: round;
        animation: spin linear 1s infinite;
        transform-origin: center;
        transform-box: fill-box;
      }
      @keyframes spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(359deg);
        }
      }
    `,
  ];

  private renderPause() {
    return svg`<path
      d="M75.0037 69V39H83.7537V69H75.0037ZM56.2537 69V39H65.0037V69H56.2537Z"
      fill="var(--text-color)"
    />`;
  }

  private renderPlay() {
    return svg`<path d="M60 71.5V36.5L87.5 54L60 71.5Z" fill="var(--text-color)" />`;
  }

  private renderLoading() {
    return svg`<path shape-rendering="crispEdges" class="loader" d="M70,74.2L70,74.2c-10.7,0-19.5-8.7-19.5-19.5l0,0c0-10.7,8.7-19.5,19.5-19.5
        l0,0c10.7,0,19.5,8.7,19.5,19.5l0,0"/>`;
  }

  override renderIcon() {
    if (this.playbackState === 'playing') {
      return this.renderPause();
    } else if (this.playbackState === 'loading') {
      return this.renderLoading();
    } else {
      return this.renderPlay();
    }
  }
}

@customElement('reset-button')
export class ResetButton extends IconButton {
  private renderResetIcon() {
    return svg`<path fill="var(--text-color)" d="M71,77.1c-2.9,0-5.7-0.6-8.3-1.7s-4.8-2.6-6.7-4.5c-1.9-1.9-3.4-4.1-4.5-6.7c-1.1-2.6-1.7-5.3-1.7-8.3h4.7
      c0,4.6,1.6,8.5,4.8,11.7s7.1,4.8,11.7,4.8c4.6,0,8.5-1.6,11.7-4.8c3.2-3.2,4.8-7.1,4.8-11.7s-1.6-8.5-4.8-11.7
      c-3.2-3.2-7.1-4.8-11.7-4.8h-0.4l3.7,3.7L71,46.4L61.5,37l9.4-9.4l3.3,3.4l-3.7,3.7H71c2.9,0,5.7,0.6,8.3,1.7
      c2.6,1.1,4.8,2.6,6.7,4.5c1.9,1.9,3.4,4.1,4.5,6.7c1.1,2.6,1.7,5.3,1.7,8.3c0,2.9-0.6,5.7-1.7,8.3c-1.1,2.6-2.6,4.8-4.5,6.7
      s-4.1,3.4-6.7,4.5C76.7,76.5,73.9,77.1,71,77.1z"/>`;
  }

  override renderIcon() {
    return this.renderResetIcon();
  }
}

/** A button for downloading the generated audio. */
@customElement('download-button')
export class DownloadButton extends IconButton {
  @property({type: Boolean, reflect: true}) disabled = false;

  static override styles = [
    IconButton.styles,
    css`
      :host([disabled]) {
        pointer-events: none;
        opacity: 0.5;
      }
      :host([disabled]) .hitbox {
        cursor: not-allowed;
      }
    `,
  ];

  private renderDownloadIcon() {
    return svg`<path fill="var(--text-color)" d="M70,35c-1.9,0-3.5,1.6-3.5,3.5v22.8l-7.6-7.6c-1.4-1.4-3.6-1.4-5,0s-1.4,3.6,0,5l13.1,13.1c0.7,0.7,1.6,1,2.5,1s1.8-0.3,2.5-1l13.1-13.1c1.4-1.4,1.4-3.6,0-5s-3.6-1.4-5,0l-7.6,7.6V38.5c0-1.9-1.6-3.5-3.5-3.5z M45,75v10h50V75H45z"/>`;
  }

  override renderIcon() {
    return this.renderDownloadIcon();
  }
}

// AddPromptButton component
// -----------------------------------------------------------------------------
/** A button for adding a new prompt. */
@customElement('add-prompt-button')
export class AddPromptButton extends IconButton {
  private renderAddIcon() {
    return svg`<path d="M67 40 H73 V52 H85 V58 H73 V70 H67 V58 H55 V52 H67 Z" fill="var(--text-color)" />`;
  }

  override renderIcon() {
    return this.renderAddIcon();
  }
}

@customElement('randomize-button')
export class RandomizeButton extends IconButton {
  private renderRandomizeIcon() {
    return svg`<text x="70" y="54" font-size="50" text-anchor="middle" dominant-baseline="middle" fill="var(--text-color)">🎲</text>`;
  }

  override renderIcon() {
    return this.renderRandomizeIcon();
  }
}

// Toast Message component
// -----------------------------------------------------------------------------

@customElement('toast-message')
class ToastMessage extends LitElement {
  static override styles = css`
    .toast {
      line-height: 1.6;
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background-color: var(--bg-color);
      color: var(--text-color);
      padding: 15px;
      border-radius: 5px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 15px;
      min-width: 200px;
      max-width: 80vw;
      transition: transform 0.5s cubic-bezier(0.19, 1, 0.22, 1);
      z-index: 11;
      border: 1px solid var(--border-color);
      text-shadow: 0 0 5px var(--glow-color);
    }
    button {
      border-radius: 100px;
      aspect-ratio: 1;
      border: none;
      background-color: var(--text-color);
      color: var(--bg-color);
      cursor: pointer;
      text-shadow: none;
    }
    .toast:not(.showing) {
      transition-duration: 1s;
      transform: translate(-50%, -200%);
    }
  `;

  @property({type: String}) message = '';
  @property({type: Boolean}) showing = false;

  override render() {
    return html`<div class=${classMap({showing: this.showing, toast: true})}>
      <div class="message">${this.message}</div>
      <button @click=${this.hide}>✕</button>
    </div>`;
  }

  show(message: string) {
    this.showing = true;
    this.message = message;
  }

  hide() {
    this.showing = false;
  }
}

/** A single prompt input */
@customElement('prompt-controller')
class PromptController extends LitElement {
  static override styles = css`
    .prompt {
      position: relative;
      height: 100%;
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      box-sizing: border-box;
      overflow: hidden;
      background-color: var(--bg-color);
      border-radius: 5px;
      border: 1px solid var(--border-color);
      box-shadow: 0 0 8px var(--glow-color);
      filter: drop-shadow(0 0 5px var(--glow-color));
    }
    .remove-button {
      position: absolute;
      top: 0.96vmin; /* 1.2vmin * 0.8 */
      left: 0.96vmin; /* 1.2vmin * 0.8 */
      background: var(--text-color);
      color: var(--bg-color);
      border: none;
      border-radius: 50%;
      width: 2.24vmin; /* 2.8vmin * 0.8 */
      height: 2.24vmin; /* 2.8vmin * 0.8 */
      font-size: 1.44vmin; /* 1.8vmin * 0.8 */
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 2.24vmin; /* 2.8vmin * 0.8 */
      cursor: pointer;
      opacity: 0.8;
      transition: opacity 0.2s;
      z-index: 10;
    }
    .remove-button:hover {
      opacity: 1;
      box-shadow: 0 0 4px var(--border-color); /* 5px * 0.8 */
    }
    weight-slider {
      max-height: calc(100% - 10vmin); /* Adjust this value as needed */
      flex: 1;
      min-height: 8vmin;
      width: 100%;
      box-sizing: border-box;
      overflow: hidden;
      margin: 3.2vmin 0 0;
    }
    .controls {
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      align-items: center;
      gap: 0.16vmin; /* 0.2vmin * 0.8 */
      width: 100%;
      height: 6.4vmin; /* 8vmin * 0.8 */
      padding: 0 0.4vmin; /* 0.5vmin * 0.8 */
      box-sizing: border-box;
      margin-bottom: 0.2vmin; /* 1vmin * 0.8 */
    }
    #text {
      font-family: 'monospace', 'Courier New', Courier, monospace; /* Terminal font */
      font-size: 1.8vmin; /* 1.8vmin * 0.8 */
      width: 100%;
      flex-grow: 1;
      max-height: 100%;
      padding: 0.32vmin; /* 0.4vmin * 0.8 */
      box-sizing: border-box;
      text-align: center;
      word-wrap: break-word;
      overflow-y: auto;
      border: none;
      outline: none;
      -webkit-font-smoothing: antialiased;
      color: var(--text-color);
      scrollbar-width: thin;
      scrollbar-color: var(--darker-text-color) var(--bg-color);
    }
    #text::-webkit-scrollbar {
      width: 4.8px; /* 6px * 0.8 */
    }
    #text::-webkit-scrollbar-track {
      background: var(--bg-color);
      border-radius: 2.4px; /* 3px * 0.8 */
    }
    #text::-webkit-scrollbar-thumb {
      background-color: var(--darker-text-color);
      border-radius: 2.4px; /* 3px * 0.8 */
    }
    :host([filtered='true']) #text {
      background: var(--error-bg-color);
      color: var(--error-text-color);
    }
    .weight-display-bottom {
      font-size: 1.6vmin; /* 1.5vmin * 0.8 */
      color: var(--text-color);
      text-align: center;
      margin-top: 0.4vmin; /* 0.5vmin * 0.8 */
      user-select: none;
      text-shadow: 0 0 4px var(--glow-color); /* 5px * 0.8 */
      transform: translateY(-15px); /* Add this to move it up 4 pixels */
    }
  `;

  @property({type: String, reflect: true}) promptId = '';
  @property({type: String}) text = '';
  @property({type: Number}) weight = 0;
  @property({type: String}) color = '';

  @query('weight-slider') private weightInput!: WeightSlider;
  @query('#text') private textInput!: HTMLSpanElement;

  private handleTextKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.updateText();
      (e.target as HTMLElement).blur();
    }
  }

  private dispatchPromptChange() {
    this.dispatchEvent(
      new CustomEvent<Prompt>('prompt-changed', {
        detail: {
          promptId: this.promptId,
          text: this.text,
          weight: this.weight,
          color: this.color,
        },
      }),
    );
  }

  private updateText() {
    console.log('updateText');
    const newText = this.textInput.textContent?.trim();
    if (newText === '') {
      this.textInput.textContent = this.text;
      return;
    }
    this.text = newText;
    this.dispatchPromptChange();
  }

  private updateWeight() {
    this.weight = this.weightInput.value;
    this.dispatchPromptChange();
  }

  private dispatchPromptRemoved() {
    this.dispatchEvent(
      new CustomEvent<string>('prompt-removed', {
        detail: this.promptId,
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    const classes = classMap({
      'prompt': true,
    });
    return html`<div class=${classes}>
      <button class="remove-button" @click=${this.dispatchPromptRemoved}
        >×</button
      >
      <weight-slider
        id="weight"
        value=${this.weight}
        color=${this.color}
        @input=${this.updateWeight}></weight-slider>
      <div class="controls">
        <span
          id="text"
          spellcheck="false"
          contenteditable="plaintext-only"
          @keydown=${this.handleTextKeyDown}
          @blur=${this.updateText}
          >${this.text}</span
        >
      </div>
      <div class="weight-display-bottom">${this.weight.toFixed(2)}</div>
    </div>`;
  }
}

/** A panel for managing real-time music generation settings. */
@customElement('settings-controller')
class SettingsController extends LitElement {
  static override styles = css`
    :host {
      display: block;
      padding: 1.5vmin; /* Adjusted for dynamic sizing */
      background-color: var(--bg-color);
      color: var(--text-color);
      box-sizing: border-box;
      border-radius: 5px;
      font-family: 'monospace', 'Courier New', Courier, monospace; /* Terminal font */
      font-size: 1.6vmin; /* Adjusted for dynamic sizing */
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: var(--darker-text-color) var(--bg-color);
      transition: width 0.3s ease-out max-height 0.3s ease-out;
      border: 1px solid var(--border-color);
      text-shadow: 0 0 5px var(--glow-color);
    }
    :host([showadvanced]) {
      max-height: 80vh; /* Increased max-height to allow more content and scrolling */
    }
    :host::-webkit-scrollbar {
      width: 6px;
    }
    :host::-webkit-scrollbar-track {
      background: var(--bg-color);
      border-radius: 3px;
    }
    :host::-webkit-scrollbar-thumb {
      background-color: var(--darker-text-color);
      border-radius: 3px;
    }
    .setting {
      margin-bottom: 0.5vmin;
      display: flex;
      flex-direction: column;
      gap: 0.5vmin;
    }
    label {
      font-weight: bold;
      display: flex;
      justify-content: space-between;
      align-items: center;
      white-space: nowrap;
      user-select: none;
      color: var(--text-color);
    }
    label span:last-child {
      font-weight: normal;
      color: var(--darker-text-color);
      min-width: 3em;
      text-align: right;
    }
    input[type='range'] {
      --track-height: 8px;
      --track-bg: var(--bg-color);
      --track-border-radius: 4px;
      --thumb-size: 16px;
      --thumb-bg: var(--text-color);
      --thumb-border-radius: 50%;
      --thumb-box-shadow: 0 0 5px var(--glow-color);
      --value-percent: 0%;
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: var(--track-height);
      background: transparent;
      cursor: pointer;
      margin: 0.5vmin 0;
      border: none;
      padding: 0;
      vertical-align: middle;
    }
    input[type='range']::-webkit-slider-runnable-track {
      width: 100%;
      height: var(--track-height);
      cursor: pointer;
      border: 1px solid var(--border-color);
      background: linear-gradient(
        to right,
        var(--thumb-bg) var(--value-percent),
        var(--track-bg) var(--value-percent)
      );
      border-radius: var(--track-border-radius);
    }
    input[type='range']::-moz-range-track {
      width: 100%;
      height: var(--track-height);
      cursor: pointer;
      background: var(--track-bg);
      border-radius: var(--track-border-radius);
      border: 1px solid var(--border-color);
    }
    input[type='range']::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      height: var(--thumb-size);
      width: var(--thumb-size);
      background: var(--thumb-bg);
      border-radius: var(--thumb-border-radius);
      box-shadow: var(--thumb-box-shadow);
      cursor: pointer;
      margin-top: calc((var(--thumb-size) - var(--track-height)) / -2);
    }
    input[type='range']::-moz-range-thumb {
      height: var(--thumb-size);
      width: var(--thumb-size);
      background: var(--thumb-bg);
      border-radius: var(--thumb-border-radius);
      box-shadow: var(--thumb-box-shadow);
      cursor: pointer;
      border: none;
    }
    input[type='number'],
    input[type='text'],
    select {
      background-color: var(--bg-color);
      color: var(--text-color);
      border: 1px solid var(--border-color);
      border-radius: 3px;
      padding: 0.4vmin;
      font-size: 1.5vmin;
      font-family: inherit;
      box-sizing: border-box;
      text-shadow: 0 0 5px var(--glow-color);
    }
    input[type='number'] {
      width: 6em;
    }
    input[type='text'] {
      width: 100%;
    }
    input[type='text']::placeholder {
      color: var(--darker-text-color);
    }
    input[type='number']:focus,
    input[type='text']:focus {
      outline: none;
      border-color: var(--border-color);
      box-shadow: 0 0 8px var(--glow-color);
    }
    select {
      width: 100%;
    }
    select:focus {
      outline: none;
      border-color: var(--border-color);
    }
    select option {
      background-color: var(--bg-color);
      color: var(--text-color);
    }
    .checkbox-setting {
      flex-direction: row;
      align-items: center;
      gap: 1vmin;
    }
    input[type='checkbox'] {
      cursor: pointer;
      accent-color: var(--text-color);
    }
    .core-settings-row {
      display: flex;
      flex-direction: row;
      flex-wrap: wrap;
      gap: 4vmin;
      margin-bottom: 1vmin;
      justify-content: space-evenly;
    }
    .core-settings-row .setting {
      min-width: 16vmin;
    }
    .core-settings-row label span:last-child {
      min-width: 2.5em;
    }
    .advanced-toggle {
      cursor: pointer;
      margin: 2vmin 0 1vmin 0;
      color: var(--text-color);
      text-decoration: underline;
      user-select: none;
      font-size: 1.4vmin;
      width: fit-content;
      text-shadow: 0 0 5px var(--glow-color);
    }
    .advanced-toggle:hover {
      color: var(--darker-text-color);
    }
    .advanced-settings {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(15vmin, 1fr)); /* Adjusted for better wrapping */
      gap: 3vmin;
      overflow-y: auto; /* Enable scrolling for advanced settings */
      max-height: 0;
      opacity: 0;
      transition:
        max-height 0.3s ease-out,
        opacity 0.3s ease-out;
    }
    .advanced-settings.visible {
      max-width: 100%; /* Allow it to take full width if needed */
      max-height: 60vmin; /* Allow content to dictate height, but with a max for transition */
      opacity: 1;
    }
    hr.divider {
      display: none;
      border: none;
      border-top: 1px solid var(--border-color);
      margin: 2vmin 0;
      width: 100%;
    }
    :host([showadvanced]) hr.divider {
      display: block;
    }
    .auto-row {
      display: flex;
      align-items: center;
      gap: 0.5vmin;
    }
    .setting[auto='true'] input[type='range'] {
      pointer-events: none;
      filter: grayscale(100%);
    }
    .auto-row span {
      margin-left: auto;
    }
    .auto-row label {
      cursor: pointer;
      color: var(--text-color);
    }
    .auto-row input[type='checkbox'] {
      cursor: pointer;
      margin: 0;
    }
    .preset-controls {
      display: flex;
      flex-direction: column;
      gap: 1vmin;
      margin-top: 2vmin;
      padding-top: 1vmin;
      border-top: 1px solid var(--border-color);
    }
    .preset-button,
    .preset-dropdown {
      background-color: var(--text-color);
      color: var(--bg-color);
      border: 1px solid var(--border-color);
      padding: 0.5vmin 1vmin;
      border-radius: 3px;
      cursor: pointer;
      font-size: 1.5vmin;
      text-shadow: none;
      box-shadow: 0 0 5px var(--glow-color);
      transition: background-color 0.2s, box-shadow 0.2s;
      width: 100%;
      box-sizing: border-box;
    }
    .preset-button:hover,
    .preset-dropdown:hover {
      background-color: var(--darker-text-color);
      box-shadow: 0 0 8px var(--glow-color);
    }
    .preset-dropdown option {
      background-color: var(--bg-color);
      color: var(--text-color);
    }
    .preset-toggle,
    .settings-toggle {
      cursor: pointer;
      font-weight: bold;
      padding: 0.3vmin 0; /* Reduced padding */
      user-select: none;
      color: var(--text-color);
      text-shadow: 0 0 5px var(--glow-color);
      font-size: 1.3vmin; /* Smaller font size */
      text-decoration: none; /* Remove underline */
    }
    .preset-toggle:hover,
    .settings-toggle:hover {
      color: var(--darker-text-color);
    }
    .preset-content {
      display: flex;
      flex-direction: column;
      gap: 1vmin;
      padding-top: 1vmin;
      margin-left: auto;
    }
    .auto-row label {
      cursor: pointer;
      color: var(--text-color);
    }
    .auto-row input[type='checkbox'] {
      cursor: pointer;
      margin: 0;
    }
    .preset-controls {
      display: flex;
      flex-direction: column;
      gap: 1vmin;
      margin-top: 2vmin;
      padding-top: 1vmin;
      border-top: 1px solid var(--border-color);
    }
    .preset-button,
    .preset-dropdown {
      background-color: var(--text-color);
      color: var(--bg-color);
      border: 1px solid var(--border-color);
      padding: 0.5vmin 1vmin;
      border-radius: 3px;
      cursor: pointer;
      font-size: 1.5vmin;
      text-shadow: none;
      box-shadow: 0 0 5px var(--glow-color);
      transition: background-color 0.2s, box-shadow 0.2s;
      width: 100%;
      box-sizing: border-box;
    }
    .preset-toggle,
    .settings-toggle {
      cursor: pointer;
      font-weight: bold;
      padding: 0.3vmin 0; /* Reduced padding */
      user-select: none;
      color: var(--text-color);
      text-shadow: 0 0 5px var(--glow-color);
      font-size: 1.3vmin; /* Smaller font size */
      text-decoration: none; /* Remove underline */
    }
    .preset-toggle:hover,
    .settings-toggle:hover {
      color: #0A0;
    }
    .preset-content {
      display: flex;
      flex-direction: column;
      gap: 1vmin;
      padding-top: 1vmin;
    }
  `;

  private readonly defaultConfig = {
    temperature: 1.1,
    topK: 40,
    guidance: 4.0,
  };

  @state() private config: LiveMusicGenerationConfig = this.defaultConfig;

  @state() showAdvanced = false;

  @state() autoDensity = true;

  @state() lastDefinedDensity: number;

  @state() autoBrightness = true;

  @state() lastDefinedBrightness: number;

  @property({type: Array}) presetNames: string[] = [];

  @state() private selectedPreset: string = '';

  @state() private visualizerFftSize: number = 2048; // Default FFT size
  @state() private visualizerSmoothing: number = 0.8; // Default smoothing

  public resetToDefaults() {
    this.config = this.defaultConfig;
    this.autoDensity = true;
    this.lastDefinedDensity = undefined;
    this.autoBrightness = true;
    this.lastDefinedBrightness = undefined;
    this.visualizerFftSize = 2048;
    this.visualizerSmoothing = 0.8;
    this.dispatchSettingsChange();
  }

  private updateSliderBackground(inputEl: HTMLInputElement) {
    if (inputEl.type !== 'range') {
      return;
    }
    const min = Number(inputEl.min) || 0;
    const max = Number(inputEl.max) || 100;
    const value = Number(inputEl.value);
    const percentage = ((value - min) / (max - min)) * 100;
    inputEl.style.setProperty('--value-percent', percentage + '%');
  }

  private handleInputChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const key = target.id as
      | keyof LiveMusicGenerationConfig
      | 'auto-density'
      | 'auto-brightness'
      | 'visualizerFftSize'
      | 'visualizerSmoothing';
    let value: string | number | boolean | undefined = target.value;

    if (target.type === 'number' || target.type === 'range') {
      value = target.value === '' ? undefined : Number(target.value);
      // Update slider background if it's a range input before handling the value change.
      if (target.type === 'range') {
        this.updateSliderBackground(target);
      }
    } else if (target.type === 'checkbox') {
      value = target.checked;
    } else if (target.type === 'select-one') {
      const selectElement = target as unknown as HTMLSelectElement;
      if (selectElement.options[selectElement.selectedIndex]?.disabled) {
        value = undefined;
      } else {
        value = target.value;
      }
    }

    if (key === 'visualizerFftSize') {
      this.visualizerFftSize = value as number;
    } else if (key === 'visualizerSmoothing') {
      this.visualizerSmoothing = value as number;
    } else {
      const newConfig = {
        ...this.config,
        [key]: value,
      };

      if (newConfig.density !== undefined) {
        this.lastDefinedDensity = newConfig.density;
        console.log(this.lastDefinedDensity);
      }

      if (newConfig.brightness !== undefined) {
        this.lastDefinedBrightness = newConfig.brightness;
      }

      if (key === 'auto-density') {
        this.autoDensity = Boolean(value);
        newConfig.density = this.autoDensity
          ? undefined
          : this.lastDefinedDensity;
      } else if (key === 'auto-brightness') {
        this.autoBrightness = Boolean(value);
        newConfig.brightness = this.autoBrightness
          ? undefined
          : this.lastDefinedBrightness;
      }

      this.config = newConfig;
    }
    this.dispatchSettingsChange();
  }

  override updated(changedProperties: Map<string | symbol, unknown>) {
    super.updated(changedProperties);
    if (changedProperties.has('config')) {
      this.shadowRoot
        ?.querySelectorAll<HTMLInputElement>('input[type="range"]')
        .forEach((slider: HTMLInputElement) => {
          const configValue =
            this.config[slider.id as keyof LiveMusicGenerationConfig];
          if (typeof configValue === 'number') {
            slider.value = String(configValue);
          } else if (slider.id === 'density' || slider.id === 'brightness') {
            // Handle potentially undefined density/brightness with default for background
            slider.value = String(configValue ?? 0.5);
          }
          this.updateSliderBackground(slider);
        });
    }
  }

  private dispatchSettingsChange() {
    this.dispatchEvent(
      new CustomEvent('settings-changed', {
        detail: {
          config: this.config,
          visualizerFftSize: this.visualizerFftSize,
          visualizerSmoothing: this.visualizerSmoothing,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private toggleAdvancedSettings() {
    this.showAdvanced = !this.showAdvanced;
  }

  private dispatchSavePreset() {
    this.dispatchEvent(new CustomEvent('save-preset', {bubbles: true, composed: true}));
  }

  private dispatchLoadPreset(e: Event) {
    const selectEl = e.target as HTMLSelectElement;
    if (selectEl.value) {
      this.selectedPreset = selectEl.value; // Update selected preset
      this.dispatchEvent(new CustomEvent<string>('load-preset', {detail: selectEl.value, bubbles: true, composed: true}));
    }
  }

  private dispatchDeletePreset() {
    if (this.selectedPreset) {
      this.dispatchEvent(new CustomEvent<string>('delete-preset', {
        detail: this.selectedPreset,
        bubbles: true,
        composed: true
      }));
    }
  }

  override render() {
    const cfg = this.config;
    const advancedClasses = classMap({
      'advanced-settings': true,
      'visible': this.showAdvanced,
    });
    const scaleMap = new Map<string, string>([
      ['Auto', 'SCALE_UNSPECIFIED'],
      ['C Major / A Minor', 'C_MAJOR_A_MINOR'],
      ['C# Major / A# Minor', 'D_FLAT_MAJOR_B_FLAT_MINOR'],
      ['D Major / B Minor', 'D_MAJOR_B_MINOR'],
      ['D# Major / C Minor', 'E_FLAT_MAJOR_C_MINOR'],
      ['E Major / C# Minor', 'E_MAJOR_D_FLAT_MINOR'],
      ['F Major / D Minor', 'F_MAJOR_D_MINOR'],
      ['F# Major / D# Minor', 'G_FLAT_MAJOR_E_FLAT_MINOR'],
      ['G Major / E Minor', 'G_MAJOR_E_MINOR'],
      ['G# Major / F Minor', 'A_FLAT_MAJOR_F_MINOR'],
      ['A Major / F# Minor', 'A_MAJOR_G_FLAT_MINOR'],
      ['A# Major / G Minor', 'B_FLAT_MAJOR_G_MINOR'],
      ['B Major / G# Minor', 'B_MAJOR_A_FLAT_MINOR'],
    ]);

    return html`
      <details>
        <summary class="settings-toggle">Core Settings</summary>
        <div class="core-settings-row">
          <div class="setting">
            <label for="temperature"
              >Temperature<span>${cfg.temperature!.toFixed(1)}</span></label
            >
            <input
              type="range"
              id="temperature"
              min="0"
              max="3"
              step="0.1"
              .value=${cfg.temperature!.toString()}
              @input=${this.handleInputChange} />
          </div>
          <div class="setting">
            <label for="guidance"
              >Guidance<span>${cfg.guidance!.toFixed(1)}</span></label
            >
            <input
              type="range"
              id="guidance"
              min="0"
              max="6"
              step="0.1"
              .value=${cfg.guidance!.toString()}
              @input=${this.handleInputChange} />
          </div>
          <div class="setting">
            <label for="topK">Top K<span>${cfg.topK}</span></label>
            <input
              type="range"
              id="topK"
              min="1"
              max="100"
              step="1"
              .value=${cfg.topK!.toString()}
              @input=${this.handleInputChange} />
          </div>
        </div>
      </details>
      <hr class="divider" />
      <div class=${advancedClasses}>
        <div class="setting">
          <label for="seed">Seed</label>
          <input
            type="number"
            id="seed"
            .value=${cfg.seed ?? ''}
            @input=${this.handleInputChange}
            placeholder="Auto" />
        </div>
        <div class="setting">
          <label for="bpm">BPM</label>
          <input
            type="number"
            id="bpm"
            min="60"
            max="180"
            .value=${cfg.bpm ?? ''}
            @input=${this.handleInputChange}
            placeholder="Auto" />
        </div>
        <div class="setting" auto=${this.autoDensity}>
          <label for="density">Density</label>
          <input
            type="range"
            id="density"
            min="0"
            max="1"
            step="0.05"
            .value=${this.lastDefinedDensity}
            @input=${this.handleInputChange} />
          <div class="auto-row">
            <input
              type="checkbox"
              id="auto-density"
              .checked=${this.autoDensity}
              @input=${this.handleInputChange} />
            <label for="auto-density">Auto</label>
            <span>${(this.lastDefinedDensity ?? 0.5).toFixed(2)}</span>
          </div>
        </div>
        <div class="setting" auto=${this.autoBrightness}>
          <label for="brightness">Brightness</label>
          <input
            type="range"
            id="brightness"
            min="0"
            max="1"
            step="0.05"
            .value=${this.lastDefinedBrightness}
            @input=${this.handleInputChange} />
          <div class="auto-row">
            <input
              type="checkbox"
              id="auto-brightness"
              .checked=${this.autoBrightness}
              @input=${this.handleInputChange} />
            <label for="auto-brightness">Auto</label>
            <span>${(this.lastDefinedBrightness ?? 0.5).toFixed(2)}</span>
          </div>
        </div>
        <div class="setting">
          <label for="scale">Scale</label>
          <select
            id="scale"
            .value=${cfg.scale || 'SCALE_UNSPECIFIED'}
            @change=${this.handleInputChange}>
            <option value="" disabled selected>Select Scale</option>
            ${[...scaleMap.entries()].map(
              ([displayName, enumValue]) =>
                html`<option value=${enumValue}>${displayName}</option>`,
            )}
          </select>
        </div>
        <div class="setting">
          <label for="visualizerFftSize">Visualizer FFT Size</label>
          <input
            type="number"
            id="visualizerFftSize"
            min="32"
            max="32768"
            step="32"
            .value=${this.visualizerFftSize.toString()}
            @input=${this.handleInputChange} />
        </div>
        <div class="setting">
          <label for="visualizerSmoothing">Visualizer Smoothing</label>
          <input
            type="range"
            id="visualizerSmoothing"
            min="0"
            max="1"
            step="0.01"
            .value=${this.visualizerSmoothing.toString()}
            @input=${this.handleInputChange} />
        </div>
        <div class="setting">
          <div class="setting checkbox-setting">
            <input
              type="checkbox"
              id="muteBass"
              .checked=${!!cfg.muteBass}
              @change=${this.handleInputChange} />
            <label for="muteBass" style="font-weight: normal;">Mute Bass</label>
          </div>
          <div class="setting checkbox-setting">
            <input
              type="checkbox"
              id="muteDrums"
              .checked=${!!cfg.muteDrums}
              @change=${this.handleInputChange} />
            <label for="muteDrums" style="font-weight: normal;"
              >Mute Drums</label
            >
          </div>
          <div class="setting checkbox-setting">
            <input
              type="checkbox"
              id="onlyBassAndDrums"
              .checked=${!!cfg.onlyBassAndDrums}
              @change=${this.handleInputChange} />
            <label for="onlyBassAndDrums" style="font-weight: normal;"
              >Only Bass & Drums</label
            >
          </div>
        </div>
      </div>
      <div class="preset-controls">
        <details>
          <summary class="preset-toggle">Preset Controls</summary>
          <div class="preset-content">
            <button @click=${this.dispatchSavePreset} class="preset-button">Save Current Prompts</button>
            <select @change=${(e: Event) => { this.selectedPreset = (e.target as HTMLSelectElement).value; this.dispatchLoadPreset(e); }} class="preset-dropdown">
              <option value="" disabled selected>Load a preset</option>
              ${this.presetNames.map(
                (name) => html`<option value=${name}>${name}</option>`,
              )}
            </select>
            <button @click=${this.dispatchDeletePreset} class="preset-button" ?disabled=${!this.selectedPreset}>Delete Selected Preset</button>
          </div>
        </details>
      </div>
      <div class="advanced-toggle" @click=${this.toggleAdvancedSettings}>
        ${this.showAdvanced ? 'Hide' : 'Show'} Advanced Settings
      </div>
    `;
  }
}

/** A component for displaying audio visualizations. */
@customElement('visualizer-component')
class VisualizerComponent extends LitElement {
  static override styles = css`
    :host {
      display: block;
      max-width: 64vmin; /* 80vmin * 0.8 */
      margin: 0 auto; /* Center the visualizer */
      /* Removed width: 100%; */
      background-color: var(--bg-color);
      border: 0.8px solid var(--border-color); /* 1px * 0.8 */
      box-sizing: border-box;
    }
    canvas {
      width: 100%;
      height: 100%;
    }
  `;

  @property({attribute: false}) analyser: AnalyserNode | undefined;
  @property({type: String}) theme: string = '';
  @query('canvas') private canvas!: HTMLCanvasElement;
  private canvasCtx!: CanvasRenderingContext2D;
  private animationFrameId: number | undefined;

  override firstUpdated() {
    this.canvasCtx = this.canvas.getContext('2d')!;
    this.draw();
  }

  override updated(changedProperties: Map<string | symbol, unknown>) {
    if (changedProperties.has('analyser') && this.analyser) {
      // Re-initialize canvas context and restart drawing if analyser changes
      this.canvasCtx = this.canvas.getContext('2d')!;
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
      }
      this.draw();
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  private draw() {
    if (!this.analyser || !this.canvasCtx) {
      this.animationFrameId = requestAnimationFrame(() => this.draw());
      return;
    }

    const bufferLength = this.analyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);

    this.analyser.getByteTimeDomainData(dataArray);

    // Clears the canvas to be transparent, allowing the host's background to show.
    this.canvasCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.canvasCtx.lineWidth = 2;
    // Gets the --text-color variable from the component's own styles.
    this.canvasCtx.strokeStyle = getComputedStyle(this).getPropertyValue('--text-color');


    this.canvasCtx.beginPath();

    const sliceWidth = this.canvas.width * 1.0 / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = v * this.canvas.height / 2;

      if (i === 0) {
        this.canvasCtx.moveTo(x, y);
      } else {
        this.canvasCtx.lineTo(x, y);
      }

      x += sliceWidth;
    }

    this.canvasCtx.lineTo(this.canvas.width, this.canvas.height / 2);
    this.canvasCtx.stroke();

    this.animationFrameId = requestAnimationFrame(() => this.draw());
  }

  override render() {
    return html`<canvas></canvas>`;
  }
}

// Component for the PromptDJ UI.
@customElement('prompt-dj')
class PromptDj extends LitElement {
  static override styles = css`
        :host {
      height: 100%;
      width: 100%;
      display: flex;
      flex-direction: column;
      justify-content: space-between; /* Push playback controls to bottom */
      align-items: center;
      box-sizing: border-box;
      padding: 0.8vmin; /* 1vmin * 0.8 */
      position: relative;
      font-size: 1.44vmin; /* 1.8vmin * 0.8 */
    }
    #background {
      position: absolute;
      height: 100%;
      width: 100%;
      z-index: -1;
      background: #000;
    }
    #main-content-scroll-area {
      flex: 1; /* Take remaining space */
      width: 100%;
      overflow-y: auto; /* Enable scrolling for main content */
      padding-bottom: 1vmin; /* Add some padding at the bottom */
    }
    #visualizer-container {
      flex: 0.3; /* Further reduced size */
      width: 100%;
      margin-bottom: 0.8vmin; /* 1vmin * 0.8 */
      pointer-events: none;
    }
    .prompts-area {
      display: flex;
      align-items: center;
      gap: 1vmin;
      width: 100%;
      margin-bottom: 1.6vmin;
    }
    #prompts-container {
      flex: 1; /* Allow the container to grow */
      display: flex;
      justify-content: center; /* Add this line */
      gap: 1.6vmin; /* 2vmin * 0.8 */
      overflow-x: auto; /* Enable horizontal scrolling */
      overflow-y: hidden;
      padding: 1vmin;
      /* Basic scrollbar styling */
      scrollbar-width: thin;
      scrollbar-color: var(--darker-text-color) transparent;
    }
    #prompts-container::-webkit-scrollbar {
      height: 8px;
    }
    #prompts-container::-webkit-scrollbar-track {
      background: transparent;
    }
    #prompts-container::-webkit-scrollbar-thumb {
      background-color: var(--darker-text-color); /* <-- Added parenthesis */
      border-radius: 4px;
    }
    .add-prompt-button-container {
      position: absolute;
      right: 2vmin;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      flex-direction: column;
      gap: 1vmin;
      z-index: 10; /* Ensure buttons are on top */
    }
    prompt-controller {
      width: 20vmin; /* Revert to original size for better fit */
      height: 32vmin; /* 40vmin * 0.8 */
      flex-shrink: 0; /* Prevent prompts from shrinking */
    }
    #settings-container {
      max-width: 90vw; /* Use max-width and remove the duplicate */
      width: 100%;
      margin-bottom: 1.6vmin; /* 2vmin * 0.8 */
      margin-left: auto;   /* Add this line */
      margin-right: auto;  /* Add this line */
    }
    .playback-container {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 1vmin; /* 2vmin * 0.8 */
      width: 100%;
      margin-top: auto; /* Push to the bottom */
      padding-top: 0.8vmin; /* 1vmin * 0.8 */
    }
    .volume-control {
      display: flex;
      align-items: center;
      gap: 0.8vmin;
    }
    .volume-control input[type='range'] {
      width: 10vmin;
      accent-color: var(--text-color);
      background: transparent;
      -webkit-appearance: none;
    }
    .volume-control input[type='range']::-webkit-slider-runnable-track {
      background: var(--darker-text-color);
      height: 4px;
      border-radius: 2px;
    }
    .volume-control input[type='range']::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--text-color);
      cursor: pointer;
      margin-top: -6px;
    }
  `;

  @property({
    type: Object,
    attribute: false,
  })
  private prompts: Map<string, Prompt>;
  private nextPromptId: number; // Monotonically increasing ID for new prompts
  private session: LiveMusicSession;
  private readonly sampleRate = 48000;
  private audioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: this.sampleRate});
  private outputNode: GainNode;
  private analyser: AnalyserNode;
  private nextStartTime = 0;
  private readonly bufferTime = 2; // adds an audio buffer in case of netowrk latency
  @state() private playbackState: PlaybackState = 'stopped';
  @state() private recordedChunks: AudioBuffer[] = [];
  @property({type: Object})
  private filteredPrompts = new Set<string>();
  private connectionError = true;

  @state() private presets: Map<string, Preset> = new Map();
  @state() private selectedPreset: string = '';

  @state() private selectedTheme: string = 'matrix-green';

  @state() private timerStartTime: number = 0;
  @state() private timerIntervalId: number | undefined;
  @state() private elapsedTime: number = 0;

  @query('play-pause-button') private playPauseButton!: PlayPauseButton;
  @query('toast-message') private toastMessage!: ToastMessage;
  @query('settings-controller') private settingsController!: SettingsController;

  constructor(prompts: Map<string, Prompt>) {
    super();
    this.prompts = prompts;
    this.nextPromptId = this.prompts.size;
    this.outputNode = this.audioContext.createGain();
    this.analyser = this.audioContext.createAnalyser();
    this.outputNode.connect(this.analyser);
    this.analyser.connect(this.audioContext.destination);
    this.presets = getStoredPresets();
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme) {
      this.selectedTheme = storedTheme;
      document.body.dataset.theme = storedTheme;
    }
  }

  override async firstUpdated() {
    await this.connectToSession();
    this.setSessionPrompts();
  }

  private formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    const pad = (num: number) => num.toString().padStart(2, '0');
    return `${pad(minutes)}:${pad(remainingSeconds)}`;
  }

  private async connectToSession() {
    this.session = await ai.live.music.connect({
      model: model,
      callbacks: {
        onmessage: async (e: LiveMusicServerMessage) => {
          console.log('Received message from the server: %s\n');
          console.log(e);
          if (e.setupComplete) {
            this.connectionError = false;
          }
          if (e.filteredPrompt) {
            this.filteredPrompts = new Set([
              ...this.filteredPrompts,
              e.filteredPrompt.text,
            ]);
            this.toastMessage.show(e.filteredPrompt.filteredReason);
          }
          if (e.serverContent?.audioChunks !== undefined) {
            if (
              this.playbackState === 'paused' ||
              this.playbackState === 'stopped'
            )
              return;
            const audioBuffer = await decodeAudioData(
              decode(e.serverContent?.audioChunks[0].data),
              this.audioContext,
              48000,
              2,
            );
            if (
              this.playbackState === 'playing' ||
              this.playbackState === 'loading'
            ) {
              this.recordedChunks = [...this.recordedChunks, audioBuffer];
            }
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            // Reconnect source to the current outputNode
            source.connect(this.outputNode);
            if (this.nextStartTime === 0) {
              this.nextStartTime =
                this.audioContext.currentTime + this.bufferTime;
              setTimeout(() => {
                this.playbackState = 'playing';
                // Start timer when playback actually begins
                if (!this.timerIntervalId) {
                  this.timerStartTime = this.audioContext.currentTime;
                  this.timerIntervalId = setInterval(() => {
                    this.elapsedTime = Math.floor(this.audioContext.currentTime - this.timerStartTime);
                    this.requestUpdate();
                  }, 1000);
                }
              }, this.bufferTime * 1000);
            }

            if (this.nextStartTime < this.audioContext.currentTime) {
              console.log('under run');
              this.playbackState = 'loading';
              this.nextStartTime = 0;
              // Stop timer on underrun
              if (this.timerIntervalId) {
                clearInterval(this.timerIntervalId);
                this.timerIntervalId = undefined;
                this.elapsedTime = 0;
              }
              return;
            }
            source.start(this.nextStartTime);
            this.nextStartTime += audioBuffer.duration;
          }
        },
        onerror: (e: ErrorEvent) => {
          console.log('Error occurred: %s\n', JSON.stringify(e));
          this.connectionError = true;
          this.stopAudio();
          this.toastMessage.show('Connection error, please restart audio.');
        },
        onclose: (e: CloseEvent) => {
          console.log('Connection closed.');
          this.connectionError = true;
          this.stopAudio();
          this.toastMessage.show('Connection error, please restart audio.');
        },
      },
    });

    // Re-initialize outputNode and analyser and connect them
    this.outputNode = this.audioContext.createGain();
    this.analyser = this.audioContext.createAnalyser();
    this.outputNode.connect(this.analyser);
    this.analyser.connect(this.audioContext.destination);
  }

  private setSessionPrompts = throttle(async () => {
    console.log('setSessionPrompts: Before setWeightedPrompts, analyser connected:', this.analyser.context.state === 'running');
    const promptsToSend = Array.from(this.prompts.values()).filter((p) => {
      return !this.filteredPrompts.has(p.text) && p.weight !== 0;
    });
    try {
      await this.session.setWeightedPrompts({
        weightedPrompts: promptsToSend,
      });
      // Ensure analyser is still connected after session update
      this.outputNode.connect(this.analyser);
      console.log('setSessionPrompts: After setWeightedPrompts, analyser connected:', this.analyser.context.state === 'running');
    } catch (e) {
      this.toastMessage.show(e.message);
      this.pauseAudio();
    }
  }, 200);

  private dispatchPromptsChange() {
    this.dispatchEvent(
      new CustomEvent('prompts-changed', {detail: this.prompts}),
    );
  }

  private handlePromptChanged(e: CustomEvent<Prompt>) {
    const {promptId, text, weight, color} = e.detail;
    const newPrompts = new Map(this.prompts); // Create a new Map
    const updatedPrompt = {...newPrompts.get(promptId)!,
      text,
      weight,
      color
    }; // Create a new prompt object
    newPrompts.set(promptId, updatedPrompt);
    this.prompts = newPrompts; // Assign the new Map

    this.setSessionPrompts();

    this.requestUpdate();
    this.dispatchPromptsChange();
  }

  private randomizePrompts() {
    const newPrompts = new Map<string, Prompt>();
    const usedPrompts = new Set<string>();
    const usedColors = new Set<string>();

    for (let i = 0; i < 4; i++) {
      let randomPrompt: string;
      do {
        randomPrompt = PROMPT_TEXT_PRESETS[Math.floor(Math.random() * PROMPT_TEXT_PRESETS.length)];
      } while (usedPrompts.has(randomPrompt));
      usedPrompts.add(randomPrompt);

      const randomWeight = Math.random() * 1.5 + 0.5;
      const color = getUnusedRandomColor(Array.from(usedColors));
      usedColors.add(color);

      const promptId = this.nextPromptId.toString();
      this.nextPromptId++;

      newPrompts.set(promptId, {
        promptId,
        text: randomPrompt,
        weight: randomWeight,
        color,
      });
    }

    this.prompts = newPrompts;
    this.setSessionPrompts();
    this.requestUpdate();
    this.dispatchPromptsChange();
  }

  private handleThemeChange(e: Event) {
    const selectEl = e.target as HTMLSelectElement;
    const theme = selectEl.value;
    this.selectedTheme = theme;
    document.body.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }

  /** Generates radial gradients for each prompt based on weight and color. */
  private makeBackground() {
    const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

    const MAX_WEIGHT = 0.5;
    const MAX_ALPHA = 0.6;

    const bg: string[] = [];

    [...this.prompts.values()].forEach((p, i) => {
      const alphaPct = clamp01(p.weight / MAX_WEIGHT) * MAX_ALPHA;
      const alpha = Math.round(alphaPct * 0xff)
        .toString(16)
        .padStart(2, '0');

      const stop = p.weight / 2;
      const x = (i % 4) / 3;
      const y = Math.floor(i / 4) / 3;
      const s = `radial-gradient(circle at ${x * 100}% ${y * 100}%, ${p.color}${alpha} 0px, ${p.color}00 ${stop * 100}%)`;

      bg.push(s);
    });

    return bg.join(', ');
  }

  private async handlePlayPause() {
    if (this.playbackState === 'playing') {
      this.pauseAudio();
    } else if (
      this.playbackState === 'paused' ||
      this.playbackState === 'stopped'
    ) {
      if (this.connectionError) {
        await this.connectToSession();
        this.setSessionPrompts();
      }
      this.loadAudio();
    } else if (this.playbackState === 'loading') {
      this.stopAudio();
    }
    console.debug('handlePlayPause');
  }

  private pauseAudio() {
    this.session.pause();
    this.playbackState = 'paused';
    this.outputNode.gain.setValueAtTime(1, this.audioContext.currentTime);
    this.outputNode.gain.linearRampToValueAtTime(
      0,
      this.audioContext.currentTime + 0.1,
    );
    this.nextStartTime = 0;
    this.outputNode = this.audioContext.createGain();
    this.outputNode.connect(this.audioContext.destination);
    // Stop timer on pause
    if (this.timerIntervalId) {
      clearInterval(this.timerIntervalId);
      this.timerIntervalId = undefined;
    }
  }

  private loadAudio() {
    this.recordedChunks = [];
    this.audioContext.resume();
    this.session.play();
    this.playbackState = 'loading';
    this.outputNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    this.outputNode.gain.linearRampToValueAtTime(
      1,
      this.audioContext.currentTime + 0.1,
    );
  }

  private stopAudio() {
    this.session.stop();
    this.playbackState = 'stopped';
    this.outputNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    this.outputNode.gain.linearRampToValueAtTime(
      1,
      this.audioContext.currentTime + 0.1,
    );
    this.nextStartTime = 0;
    // Stop and reset timer on stop
    if (this.timerIntervalId) {
      clearInterval(this.timerIntervalId);
      this.timerIntervalId = undefined;
      this.elapsedTime = 0;
    }
  }

  private async handleAddPrompt() {
    console.log('handleAddPrompt: Before adding prompt, analyser connected:', this.analyser.context.state === 'running');
    const newPromptId = `prompt-${this.nextPromptId++}`;
    const usedColors = [...this.prompts.values()].map((p) => p.color);
    const newPrompt: Prompt = {
      promptId: newPromptId,
      text: 'New Prompt', // Default text
      weight: 0,
      color: getUnusedRandomColor(usedColors),
    };
    const newPrompts = new Map(this.prompts);
    newPrompts.set(newPromptId, newPrompt);
    this.prompts = newPrompts;

    await this.setSessionPrompts();
    console.log('handleAddPrompt: After adding prompt, analyser connected:', this.analyser.context.state === 'running');

    // Wait for the component to update and render the new prompt.
    // Do not dispatch the prompt change event until the user has edited the prompt text.
    await this.updateComplete;

    // Find the newly added prompt controller element
    const newPromptElement = this.renderRoot.querySelector<PromptController>(
      `prompt-controller[promptId="${newPromptId}"]`,
    );
    if (newPromptElement) {
      // Scroll the prompts container to the new prompt element
      newPromptElement.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'end',
      });

      // Select the new prompt text
      const textSpan =
        newPromptElement.shadowRoot?.querySelector<HTMLSpanElement>('#text');
      if (textSpan) {
        textSpan.focus();
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(textSpan);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
  }

  private handlePromptRemoved(e: CustomEvent<string>) {
    e.stopPropagation();
    const promptIdToRemove = e.detail;
    if (this.prompts.has(promptIdToRemove)) {
      this.prompts.delete(promptIdToRemove);
      const newPrompts = new Map(this.prompts);
      this.prompts = newPrompts;
      this.setSessionPrompts();
      this.dispatchPromptsChange();
    } else {
      console.warn(
        `Attempted to remove non-existent prompt ID: ${promptIdToRemove}`,
      );
    }
  }

  private async saveCurrentPromptsAsPreset() {
    const presetName = prompt('Enter a name for this preset:');
    if (presetName && presetName.trim() !== '') {
      const newPreset: Preset = {
        name: presetName.trim(),
        prompts: Array.from(this.prompts.values()),
      };
      const updatedPresets = new Map(this.presets);
      updatedPresets.set(newPreset.name, newPreset);
      this.presets = updatedPresets;
      setStoredPresets(this.presets);
      this.toastMessage.show(`Preset '${newPreset.name}' saved!`);
    } else {
      this.toastMessage.show('Preset name cannot be empty.');
    }
  }

  private async loadPromptsFromPreset(presetName: string) {
    const preset = this.presets.get(presetName);
    if (preset) {
      this.prompts = new Map(preset.prompts.map((p) => [p.promptId, p]));
      this.nextPromptId = this.prompts.size;
      await this.setSessionPrompts();
      this.toastMessage.show(`Preset '${presetName}' loaded!`);
    } else {
      this.toastMessage.show(`Preset '${presetName}' not found.`);
    }
  }

  private handleDeletePreset(presetName: string) {
    if (confirm(`Are you sure you want to delete the preset '${presetName}'?`)) {
      // Create a new Map to ensure Lit's reactivity detects the change.
      const newPresets = new Map(this.presets);
      newPresets.delete(presetName);
      this.presets = newPresets; // Assign the new map to the state property

      setStoredPresets(this.presets);
      this.toastMessage.show(`Preset '${presetName}' deleted.`);
    }
  }

  // Handle scrolling X-axis the prompts container.
  private handlePromptsContainerWheel(e: WheelEvent) {
    const container = e.currentTarget as HTMLElement;
    if (e.deltaX !== 0) {
      // Prevent the default browser action (like page back/forward)
      e.preventDefault();
      container.scrollLeft += e.deltaX;
    }
  }

  private concatenateAudioBuffers(
    buffers: AudioBuffer[],
  ): AudioBuffer | null {
    if (buffers.length === 0) {
      return null;
    }

    const firstBuffer = buffers[0];
    const {numberOfChannels, sampleRate} = firstBuffer;

    let totalLength = 0;
    for (const buffer of buffers) {
      totalLength += buffer.length;
    }

    const result = this.audioContext.createBuffer(
      numberOfChannels,
      totalLength,
      sampleRate,
    );

    for (let channel = 0; channel < numberOfChannels; channel++) {
      const channelData = result.getChannelData(channel);
      let offset = 0;
      for (const buffer of buffers) {
        if (buffer.numberOfChannels > channel) {
          channelData.set(buffer.getChannelData(channel), offset);
        }
        offset += buffer.length;
      }
    }

    return result;
  }

  private handleDownload() {
    if (this.recordedChunks.length === 0) {
      this.toastMessage.show('No audio has been generated to download.');
      return;
    }

    this.toastMessage.show('Preparing download, this may take a moment...');

    // Use a timeout to allow the toast to render before blocking the main thread
    setTimeout(() => {
      const concatenatedBuffer = this.concatenateAudioBuffers(
        this.recordedChunks,
      );
      if (!concatenatedBuffer) {
        this.toastMessage.show('Failed to prepare audio for download.');
        return;
      }

      const wavBlob = audioBufferToWav(concatenatedBuffer);
      const url = URL.createObjectURL(wavBlob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      const promptTexts = Array.from(this.prompts.values())
        .map(p => p.text.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-').substring(0, 30))
        .filter(Boolean);

      const date = new Date();
      const timestamp = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}_${date.getHours().toString().padStart(2, '0')}${date.getMinutes().toString().padStart(2, '0')}${date.getSeconds().toString().padStart(2, '0')}`;

      const filename = promptTexts.length > 0
        ? `${promptTexts.join('_')}_${timestamp}.wav`
        : `generated_audio_${timestamp}.wav`;

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      this.toastMessage.hide();
    }, 100);
  }

  private updateSettings = throttle(
    async (e: CustomEvent<LiveMusicGenerationConfig>) => {
      await this.session?.setMusicGenerationConfig({
        musicGenerationConfig: e.detail,
      });
    },
    200,
  );

  private async handleReset() {
    if (this.connectionError) {
      await this.connectToSession();
      this.setSessionPrompts();
    }
    this.pauseAudio();
    this.session.resetContext();
    this.settingsController.resetToDefaults();
    this.session?.setMusicGenerationConfig({
      musicGenerationConfig: {},
    });
    this.recordedChunks = [];

    // Reset timer on reset
    if (this.timerIntervalId) {
      clearInterval(this.timerIntervalId);
      this.timerIntervalId = undefined;
    }
    this.timerStartTime = 0;
    this.elapsedTime = 0;

    // Re-create and re-connect analyser and outputNode
    this.outputNode = this.audioContext.createGain();
    this.analyser = this.audioContext.createAnalyser();
    this.outputNode.connect(this.analyser);
    this.analyser.connect(this.audioContext.destination);

    // Explicitly update the visualizer component's analyser property
    const visualizer = this.renderRoot.querySelector('visualizer-component');
    if (visualizer) {
      visualizer.analyser = this.analyser;
    }

    setTimeout(this.loadAudio.bind(this), 100);
  }

  override render() {
    const bg = styleMap({
      backgroundImage: this.makeBackground(),
    });
    return html`<div id="background" style=${bg}></div>
      <div id="main-content-scroll-area">
        <div id="visualizer-container">
          <visualizer-component .analyser=${this.analyser} .theme=${this.selectedTheme}></visualizer-component>
        </div>
        <div class="prompts-area">
          <div
            id="prompts-container"
            @prompt-removed=${this.handlePromptRemoved}
            @wheel=${this.handlePromptsContainerWheel}>
            ${this.renderPrompts()}
          </div>
          <div class="add-prompt-button-container">
            <randomize-button @click=${this.randomizePrompts}></randomize-button>
            <add-prompt-button
              @click=${this.handleAddPrompt}
              ?disabled=${this.prompts.size >= 16}></add-prompt-button>
          </div>
        </div>
        <div id="settings-container">
          <settings-controller
            .presetNames=${Array.from(this.presets.keys())}
            @save-preset=${this.saveCurrentPromptsAsPreset}
            @load-preset=${(e: CustomEvent<string>) =>
              this.loadPromptsFromPreset(e.detail)}
            @delete-preset=${(e: CustomEvent<string>) =>
              this.handleDeletePreset(e.detail)}
            @settings-changed=${(e: CustomEvent<{config: LiveMusicGenerationConfig, visualizerFftSize: number, visualizerSmoothing: number}>) => {
              this.updateSettings(e.detail.config);
              this.analyser.fftSize = e.detail.visualizerFftSize;
              this.analyser.smoothingTimeConstant = e.detail.visualizerSmoothing;
            }}></settings-controller>
        </div>
      </div>
      <div class="playback-container">
        <play-pause-button
          @click=${this.handlePlayPause}
          .playbackState=${this.playbackState}></play-pause-button>
        <download-button
          @click=${this.handleDownload}
          ?disabled=${this.recordedChunks.length === 0}></download-button>
        <reset-button @click=${this.handleReset}></reset-button>
        <div class="volume-control">
          <label for="volume">Volume</label>
          <input
            type="range"
            id="volume"
            min="0"
            max="1"
            step="0.01"
            .value=${this.outputNode.gain.value.toString()}
            @input=${(e: Event) =>
              (this.outputNode.gain.value = Number((e.target as HTMLInputElement).value))}
          />
        </div>
        <div class="timer-display">${this.formatTime(this.elapsedTime)}</div>
      </div>
      <toast-message></toast-message>`;
  }

  private renderPrompts() {
    return repeat(
      [...this.prompts.values()],
      (prompt) => prompt.promptId,
      (prompt) => html`<prompt-controller
        .promptId=${prompt.promptId}
        filtered=${this.filteredPrompts.has(prompt.text)}
        .text=${prompt.text}
        .weight=${prompt.weight}
        .color=${prompt.color}
        @prompt-changed=${this.handlePromptChanged}>
      </prompt-controller>`,
    );
  }
}

function gen(parent: HTMLElement) {
  const initialPrompts = getStoredPrompts();

  const pdj = new PromptDj(initialPrompts);
  parent.appendChild(pdj);
}

function getStoredPrompts(): Map<string, Prompt> {
  const {localStorage} = window;
  const storedPrompts = localStorage.getItem('prompts');

  if (storedPrompts) {
    try {
      const prompts = JSON.parse(storedPrompts) as Prompt[];
      console.log('Loading stored prompts', prompts);
      return new Map(prompts.map((prompt) => [prompt.promptId, prompt]));
    } catch (e) {
      console.error('Failed to parse stored prompts', e);
    }
  }

  console.log('No stored prompts, creating prompt presets');

  const numDefaultPrompts = Math.min(4, PROMPT_TEXT_PRESETS.length);
  const shuffledPresetTexts = [...PROMPT_TEXT_PRESETS].sort(
    () => Math.random() - 0.5,
  );
  const defaultPrompts: Prompt[] = [];
  const usedColors: string[] = [];
  for (let i = 0; i < numDefaultPrompts; i++) {
    const text = shuffledPresetTexts[i];
    const color = getUnusedRandomColor(usedColors);
    usedColors.push(color);
    defaultPrompts.push({
      promptId: `prompt-${i}`,
      text,
      weight: 0,
      color,
    });
  }
  // Randomly select up to 2 prompts to set their weight to 1.
  const promptsToActivate = [...defaultPrompts].sort(() => Math.random() - 0.5);
  const numToActivate = Math.min(2, defaultPrompts.length);
  for (let i = 0; i < numToActivate; i++) {
    if (promptsToActivate[i]) {
      promptsToActivate[i].weight = 1;
    }
  }
  return new Map(defaultPrompts.map((p) => [p.promptId, p]));
}

function setStoredPrompts(prompts: Map<string, Prompt>) {
  const storedPrompts = JSON.stringify([...prompts.values()]);
  const {localStorage} = window;
  localStorage.setItem('prompts', storedPrompts);
}

function main(container: HTMLElement) {
  gen(container);
}

main(document.body);

declare global {
  interface HTMLElementTagNameMap {
    'prompt-dj': PromptDj;
    'prompt-controller': PromptController;
    'settings-controller': SettingsController;
    'add-prompt-button': AddPromptButton;
    'play-pause-button': PlayPauseButton;
    'reset-button': ResetButton;
    'download-button': DownloadButton;
    'weight-slider': WeightSlider;
    'toast-message': ToastMessage;
  }
}