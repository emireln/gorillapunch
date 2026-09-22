import logoUrl from '../../../assets/logo.svg';

export function GorillaMark({ size = 28 }: { size?: number }) {
  return <img src={logoUrl} width={size} height={size} alt="" aria-hidden="true"/>;
}

export function Brand() {
  return <div className="desktop-brand"><GorillaMark/><span>GORILLA<b>PUNCH</b></span><em>DESKTOP</em></div>;
}
