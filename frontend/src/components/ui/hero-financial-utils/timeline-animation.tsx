import { createElement, useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
interface Props { as?: 'div'|'h1'|'h2'|'p'|'button'|'img'; animationNum: number; timelineRef?: RefObject<HTMLDivElement>; className?: string; children?: ReactNode; onClick?: () => void; src?: string; alt?: string; }
export function TimelineAnimation({as='div',animationNum,className='',children,...props}:Props) {
  const element=useRef<HTMLElement>(null);
  const [visible,setVisible]=useState(false);
  useEffect(()=>{
    if(!element.current)return;
    const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setVisible(true);observer.disconnect();}},{threshold:0.08});
    observer.observe(element.current);return ()=>observer.disconnect();
  },[]);
  const {timelineRef: _timelineRef,...rest}=props;
  return createElement(as,{...rest,ref:element,className:`ac-reveal ${visible?'is-visible':''} ${className}`,style:{'--reveal-delay':`${Math.min(animationNum,7)*70}ms`} as CSSProperties},children);
}
