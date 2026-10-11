// Platform-independent dimensions and shade stops shared by web and native sheets.
export const drawerDesign = {
  handleAreaHeight: 32,
  pillWidth: 48,
  pillHeight: 6,
  pillColor: 'rgba(255,255,255,0.7)',
  shadeHeight: 64,
  shadeColors: ['rgba(0,0,0,0.6)', 'rgba(0,0,0,0.46)', 'rgba(0,0,0,0.24)', 'rgba(0,0,0,0.08)', 'rgba(0,0,0,0.015)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)'],
  shadeLocations: [0, 0.15, 0.35, 0.6, 0.8, 0.92, 1],
} as const;
export const drawerShadeCss = `linear-gradient(180deg, ${drawerDesign.shadeColors.map((color, index) => `${color} ${drawerDesign.shadeLocations[index]! * 100}%`).join(', ')})`;
