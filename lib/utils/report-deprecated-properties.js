import _ from 'lodash'
import logDeprecation from './log-deprecation.js'

const getMessage = (props, serviceConfig) => {
  const warnings = []

  for (const [oldProp, newProp] of Object.entries(props)) {
    if (_.get(serviceConfig, oldProp) != null) {
      warnings.push([oldProp, newProp])
    }
  }

  if (warnings.length) {
    const what = warnings.length > 1 ? 'properties' : 'property'
    const details = warnings
      .map(([oldProp, newProp]) => `  "${oldProp}" -> "${newProp}"`)
      .join('\n')
    return `Starting with version 4.0.0, following ${what} will be replaced:\n${details}`
  }
  return null
}

export default (code, props, { serviceConfig } = {}) => {
  const msg = getMessage(props, serviceConfig)
  if (msg) {
    logDeprecation(code, msg, { serviceConfig })
  }
}
