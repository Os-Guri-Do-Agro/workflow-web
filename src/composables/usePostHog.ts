import posthog from 'posthog-js'

let initialized = false

export function usePostHog() {
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

  if (!isLocalhost && !initialized) {
    posthog.init('phc_R2URgzaU31qEMn23Oic9OpMNfACJW8fvcNWne67ZgFq', {
      api_host: 'https://us.i.posthog.com',
      person_profiles: 'always',
    })
    initialized = true
  }

  return {
    posthog,
    capturePageview: () => {
      if (initialized) posthog.capture('$pageview')
    },
  }
}