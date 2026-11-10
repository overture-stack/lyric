# Roadmap: Kafka message format design

Current message shape (`action`, `categoryAlias`, `categoryId`, `data`, `entityName`, `isValid`, `organization`, `systemId`) was designed around Maestro's needs. Open question from PR #208: too Maestro-specific, or should it include more fields (submission date, user) for other consumers? No backward-compatibility risk either way, Lyric never published to this topic before this feature existed; this is a design-quality question, not a break-something-today one.
