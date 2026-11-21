import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

export const viewport: Viewport = {
  colorScheme: 'light dark',
}

export const metadata: Metadata = {
  title: 'MiniNav - 我的导航',
  description: '个人书签导航站，快速访问常用网站',
  applicationName: 'MiniNav',
  icons: {
    icon: [{ url: '/favicon-32.png', sizes: '32x32', type: 'image/png' }],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
}

const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem('mininav_theme');var h=document.documentElement;if(t==='dark'){h.classList.add('theme-dark');h.style.colorScheme='dark'}else if(t==='sepia'){h.classList.add('theme-sepia');h.style.colorScheme='light'}else{h.style.colorScheme='light'}}catch(e){}`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" className="bg-background" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  )
}
