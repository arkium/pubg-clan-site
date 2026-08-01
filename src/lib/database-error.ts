import { Prisma } from '@prisma/client'

export type DatabaseErrorPresentation = {
  title: string
  description: string
  checks: string[]
}

export function getDatabaseErrorPresentation(error: unknown): DatabaseErrorPresentation | null {
  if (!(error instanceof Prisma.PrismaClientInitializationError)) {
    return null
  }

  const message = error.message

  if (error.errorCode === 'P1000' || message.includes('Authentication failed against database server')) {
    return {
      title: 'Accès à la base refusé',
      description:
        "L'application atteint le serveur, mais la connexion est refusée pour ces identifiants ou depuis cette machine.",
      checks: [
        'Comparez la configuration locale avec le DATABASE_URL réellement chargé en production.',
        "Vérifiez que le compte MySQL est autorisé depuis l'adresse IP de cette machine.",
        "Contrôlez le mot de passe et l'encodage de ses caractères spéciaux dans l'URL.",
      ],
    }
  }

  if (
    error.errorCode === 'P1001' ||
    error.errorCode === 'P1002' ||
    error.errorCode === 'P1017' ||
    message.includes("Can't reach database server") ||
    message.includes('was reached but timed out') ||
    message.includes('Server has closed the connection')
  ) {
    return {
      title: 'Base de données inaccessible',
      description: "L'application ne parvient pas à établir une connexion avec le serveur de données.",
      checks: [
        'Vérifiez que le serveur de base de données est démarré.',
        "Contrôlez l'hôte et le port renseignés dans DATABASE_URL.",
        "Vérifiez le pare-feu et l'accès réseau depuis ce serveur.",
      ],
    }
  }

  if (error.errorCode === 'P1003' || message.includes('does not exist on the database server')) {
    return {
      title: 'Base de données introuvable',
      description: "Le serveur répond, mais la base configurée n'existe pas ou n'est pas accessible.",
      checks: [
        'Vérifiez le nom de la base dans DATABASE_URL.',
        "Créez la base si elle n'existe pas encore.",
        'Confirmez que le compte dispose des droits nécessaires.',
      ],
    }
  }

  return {
    title: 'Connexion à la base impossible',
    description: "L'application ne peut pas initialiser sa connexion à la base de données.",
    checks: [
      'Vérifiez le format complet de DATABASE_URL.',
      'Contrôlez la configuration et les journaux du serveur de données.',
      'Corrigez la configuration, puis réessayez.',
    ],
  }
}