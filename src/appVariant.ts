export type AppVariant = 'dev' | 'prod';

export const APP_VARIANT: AppVariant = __DEV__ ? 'dev' : 'prod';
export const isDevAppVariant = APP_VARIANT === 'dev';
