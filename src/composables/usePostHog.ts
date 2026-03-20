import posthog from 'posthog-js'

export function usePostHog() {
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

  if (!isLocalhost) {
    posthog.init('phc_R2URgzaU31qEMn23Oic9OpMNfACJW8fvcNWne67ZgFq', {
      api_host: window.location.origin + '/ingest',
      person_profiles: 'always',
    })
  }

  return { posthog }
}