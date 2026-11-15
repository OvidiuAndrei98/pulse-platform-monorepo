import type {LucideIcon} from 'lucide-react-native';
export type GroupMenuItem={id:string;label:string;onPress:()=>void;icon?:LucideIcon;nativeImage?:string;disabled?:boolean;destructive?:boolean;testID?:string};
export type GroupMenuProps={label:string;items:GroupMenuItem[];testID?:string;icon?:LucideIcon;disabled?:boolean};
