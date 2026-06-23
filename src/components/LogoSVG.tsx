import React from 'react';

export const LOGO_SVG_RAW = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="100%" height="100%">
  <defs>
    <linearGradient id="orange-grad" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ff7e00" />
      <stop offset="50%" stop-color="#ff9a00" />
      <stop offset="100%" stop-color="#ffbf00" />
    </linearGradient>
    <linearGradient id="purple-grad" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#4a0e4e" />
      <stop offset="50%" stop-color="#880e4f" />
      <stop offset="100%" stop-color="#ad1457" />
    </linearGradient>
    <linearGradient id="yellow-lime-grad" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#a3e635" />
      <stop offset="50%" stop-color="#facc15" />
      <stop offset="100%" stop-color="#eab308" />
    </linearGradient>
    <path id="text-path" d="M 65 250 A 185 185 0 0 1 435 250" fill="none" />
  </defs>
  <!-- Background -->
  <circle cx="250" cy="250" r="248" fill="#ffffff" />
  <!-- Outer Grey Ring -->
  <circle cx="250" cy="250" r="236" fill="none" stroke="#94a3b8" stroke-width="5" />
  <!-- Yellow Ring highlight -->
  <path d="M 85 390 A 210 210 0 1 1 415 390" fill="none" stroke="url(#yellow-lime-grad)" stroke-width="8" stroke-linecap="round" />
  <!-- Swoosh details -->
  <path d="M 70 380 C 50 300, 60 210, 110 150" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round" />
  <path d="M 430 380 C 450 300, 440 210, 390 150" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round" />
  
  <!-- Curved Text -->
  <text fill="#025bf3" font-weight="900" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="24.5" letter-spacing="1.2">
    <textPath href="#text-path" startOffset="50%" text-anchor="middle">LOMURIANGOLE CYDC UG 1083</textPath>
  </text>
  
  <!-- Orange Figure -->
  <!-- Head -->
  <circle cx="228" cy="155" r="25" fill="url(#orange-grad)" />
  <!-- Body and active rising arm -->
  <path d="M 195 240 C 150 190, 220 170, 235 185 C 255 205, 275 180, 298 152 C 303 147, 308 152, 303 157 C 288 185, 258 208, 248 223 C 225 250, 230 270, 238 310 C 242 325, 245 332, 240 331 C 232 328, 208 288, 201 268 Z" fill="url(#orange-grad)" />
  
  <!-- Purple Figure -->
  <!-- Head -->
  <circle cx="290" cy="225" r="20" fill="url(#purple-grad)" />
  <!-- Body and hands reaching open -->
  <path d="M 285 245 C 265 230, 248 215, 238 215 C 233 215, 238 225, 250 240 C 268 260, 272 275, 268 305 C 265 318, 255 328, 250 328 C 255 328, 280 310, 298 300 C 318 290, 328 255, 328 230 C 328 225, 323 225, 314 235 C 304 245, 295 252, 288 248 Z" fill="url(#purple-grad)" />
  
  <!-- Open Book -->
  <!-- Main white backing with thick black outlines -->
  <path d="M 250 395 C 205 395, 145 365, 105 365 C 130 325, 185 305, 245 335 C 248 336, 252 336, 255 335 C 315 305, 370 325, 395 365 C 355 365, 295 395, 250 395 Z" fill="#ffffff" stroke="#000000" stroke-width="8" stroke-linejoin="round" />
  <!-- Under lines shadow/spine and pages -->
  <path d="M 250 395 C 210 395, 160 370, 125 365" fill="none" stroke="#000000" stroke-width="3" stroke-linecap="round" />
  <path d="M 250 395 C 290 395, 340 370, 375 365" fill="none" stroke="#000000" stroke-width="3" stroke-linecap="round" />
  <path d="M 250 338 L 250 395" fill="none" stroke="#000000" stroke-width="4.5" stroke-linecap="round" />
  <path d="M 130 382 C 180 382, 225 352, 250 342" fill="none" stroke="#000000" stroke-width="1.5" />
  <path d="M 370 382 C 320 382, 275 352, 250 342" fill="none" stroke="#000000" stroke-width="1.5" />
  
  <!-- Bottom Text inside the circle -->
  <text x="250" y="418" fill="#ff0000" font-weight="950" font-family="sans-serif" font-size="17" letter-spacing="0.5" text-anchor="middle">MATHEW 19:14</text>
  <text x="250" y="438" fill="#025bf3" font-weight="950" font-family="sans-serif" font-size="15.5" letter-spacing="0.5" text-anchor="middle">LET THE CHILDREN COME TO ME</text>
</svg>`;

export const getLogoBase64DataUri = () => {
  if (typeof btoa !== 'undefined') {
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(LOGO_SVG_RAW)));
  }
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(LOGO_SVG_RAW);
};

interface LogoSVGProps extends React.SVGProps<SVGSVGElement> {}

export const LogoSVG: React.FC<LogoSVGProps> = (props) => {
  return (
    <div className={props.className} style={props.style}>
      <div dangerouslySetInnerHTML={{ __html: LOGO_SVG_RAW }} className="w-full h-full" />
    </div>
  );
};

export default LogoSVG;
