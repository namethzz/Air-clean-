import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Menu, X } from 'lucide-react';
export default function MotionDrawer({children}:{children:ReactNode}){
 const [open,setOpen]=useState(false);const dialog=useRef<HTMLDialogElement>(null);const trigger=useRef<HTMLButtonElement>(null);
 useEffect(()=>{if(open){dialog.current?.showModal();const previous=document.body.style.overflow;document.body.style.overflow='hidden';return ()=>{document.body.style.overflow=previous;};}dialog.current?.close();},[open]);
 return <><button ref={trigger} className="ac-menu-button" aria-label="เปิดเมนูเว็บไซต์" aria-expanded={open} onClick={()=>setOpen(true)}><Menu size={22}/></button><dialog ref={dialog} className="ac-drawer" aria-label="เมนูเว็บไซต์" onCancel={()=>setOpen(false)} onClose={()=>{setOpen(false);trigger.current?.focus();}} onClick={event=>{if(event.target===event.currentTarget)setOpen(false);}}><div className="ac-drawer-content"><button className="ac-menu-button ac-drawer-close" aria-label="ปิดเมนูเว็บไซต์" onClick={()=>setOpen(false)}><X size={22}/></button><div onClick={event=>{if((event.target as HTMLElement).closest('a,button'))setOpen(false);}}>{children}</div></div></dialog></>;
}
