export const BINS:Record<string,[number,number]>;
export const RECIPES:Record<string,string[]>;
export const ASSEMBLY:[number,number];
export const COOK:[number,number];
export function cookingPose(now:number,started?:number):{t:number;stage:number;left:[number,number,number];right:[number,number,number];food:[number,number,number];whole:boolean;halves:boolean;split:number;stream:boolean;foodVisible:boolean;spread:number;steam:boolean;spatula:boolean;plated:boolean};
export function exhibitCopy(ru:boolean):Record<string,unknown>;
