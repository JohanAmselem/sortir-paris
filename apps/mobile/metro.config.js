// Metro : l'appli partage avec le site quelques modules PURS de apps/web/src/lib
// (heure de Paris, prix, catégories, quiz, contrat de l'API). Ils sont lus en
// place, jamais copiés. Leurs imports de paquets (date-fns-tz…) sont résolus
// depuis l'appli : jamais depuis les node_modules du site (pnpm, hors du projet).
const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)
const webLib = path.resolve(__dirname, '../web/src/lib')
const appEntry = path.join(__dirname, 'package.json')

config.watchFolders = [...(config.watchFolders ?? []), webLib]

const defaultResolve = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const fromWeb = context.originModulePath.startsWith(webLib + path.sep)
  const bare = !moduleName.startsWith('.') && !path.isAbsolute(moduleName)
  const ctx = fromWeb && bare ? { ...context, originModulePath: appEntry } : context
  return defaultResolve ? defaultResolve(ctx, moduleName, platform) : ctx.resolveRequest(ctx, moduleName, platform)
}

module.exports = config
