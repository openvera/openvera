import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { Theme } from '@radix-ui/themes'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CompanyProvider, OpenVeraProvider } from 'openvera'

import App from './App'

import '@radix-ui/themes/tokens.css'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Theme>
        <BrowserRouter>
          <OpenVeraProvider>
            <CompanyProvider>
              <App />
            </CompanyProvider>
          </OpenVeraProvider>
        </BrowserRouter>
      </Theme>
    </QueryClientProvider>
  </StrictMode>,
)
