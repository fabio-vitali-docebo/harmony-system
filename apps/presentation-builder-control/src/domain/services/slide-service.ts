import { injectable } from 'tsyringe';

export interface Slide {
  id: string;
  type: SlideType;
  title: string;
  content: SlideContent;
  layout: SlideLayout;
  style: SlideStyle;
  metadata: SlideMetadata;
}

export enum SlideType {
  TITLE = 'title',
  CONTENT = 'content',
  SECTION = 'section',
  COMPARISON = 'comparison',
  CONCLUSION = 'conclusion'
}

export interface SlideContent {
  mainText?: string;
  bulletPoints?: string[];
  images?: SlideImage[];
  tables?: SlideTable[];
  quotes?: SlideQuote[];
  citations?: SlideCitation[];
}

export interface SlideImage {
  src: string;
  alt: string;
  caption?: string;
  width?: string;
  height?: string;
}

export interface SlideTable {
  headers: string[];
  rows: string[][];
  caption?: string;
}

export interface SlideQuote {
  text: string;
  author?: string;
  source?: string;
}

export interface SlideCitation {
  id: string;
  text: string;
  url?: string;
}

export interface SlideLayout {
  template: 'single-column' | 'two-column' | 'three-column' | 'image-left' | 'image-right';
  alignment: 'left' | 'center' | 'right';
}

export interface SlideStyle {
  backgroundColor?: string;
  textColor?: string;
  accentColor?: string;
  fontFamily?: string;
  fontSize?: string;
}

export interface SlideMetadata {
  duration?: number;
  transition?: string;
  notes?: string;
  accessibility?: {
    altText: string[];
    headingLevel: number;
  };
}

@injectable()
export class SlideService {
  generateHTMLPresentation(
    slides: Slide[],
    title: string,
    theme: string = 'professional'
  ): string {
    const htmlTemplate = this.getHTMLTemplate(title, theme);
    const slidesHTML = slides.map(slide => this.generateSlideHTML(slide)).join('\n');

    return htmlTemplate
      .replace('{{SLIDES}}', slidesHTML)
      .replace('{{TITLE}}', title)
      .replace('{{SLIDE_COUNT}}', slides.length.toString());
  }

  private generateSlideHTML(slide: Slide): string {
    const slideClass = `slide slide-${slide.type} layout-${slide.layout.template}`;

    return `
      <div class="${slideClass}" id="${slide.id}">
        <div class="slide-content">
          ${this.generateSlideContentHTML(slide)}
        </div>
      </div>
    `;
  }

  private generateSlideContentHTML(slide: Slide): string {
    let html = `<h2 class="slide-title">${slide.title}</h2>`;

    if (slide.content.mainText) {
      html += `<div class="main-text">${slide.content.mainText}</div>`;
    }

    if (slide.content.bulletPoints?.length) {
      html += '<ul class="bullet-points">';
      slide.content.bulletPoints.forEach(point => {
        html += `<li>${point}</li>`;
      });
      html += '</ul>';
    }

    return html;
  }

  private getHTMLTemplate(title: string, theme: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>${this.getCSS(theme)}</style>
</head>
<body>
    <div class="presentation">
        {{SLIDES}}
    </div>
    <script>${this.getJavaScript()}</script>
</body>
</html>`;
  }

  private getCSS(theme: string): string {
    return `
      .presentation { width: 100%; height: 100vh; overflow: hidden; }
      .slide { width: 100%; height: 100vh; display: none; padding: 2rem; box-sizing: border-box; }
      .slide.active { display: flex; flex-direction: column; justify-content: center; }
      .slide-title { font-size: 2.5rem; margin-bottom: 1rem; }
      .main-text { font-size: 1.2rem; line-height: 1.6; margin-bottom: 1rem; }
      .bullet-points { font-size: 1.1rem; line-height: 1.8; }
      @media (max-width: 768px) {
        .slide { padding: 1rem; }
        .slide-title { font-size: 2rem; }
      }
    `;
  }

  private getJavaScript(): string {
    return `
      let currentSlide = 0;
      const slides = document.querySelectorAll('.slide');

      function showSlide(n) {
        slides.forEach(slide => slide.classList.remove('active'));
        slides[n].classList.add('active');
      }

      function nextSlide() {
        currentSlide = (currentSlide + 1) % slides.length;
        showSlide(currentSlide);
      }

      function prevSlide() {
        currentSlide = (currentSlide - 1 + slides.length) % slides.length;
        showSlide(currentSlide);
      }

      document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') nextSlide();
        if (e.key === 'ArrowLeft') prevSlide();
      });

      showSlide(0);
    `;
  }
}