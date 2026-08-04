import { InstanceConfigManager } from "./configuration-loader";

// Translation keys used throughout the app
type TranslationKey =
  | 'loading'
  | 'hivesigner_login_failed'
  | 'loadingPost'
  | 'loadingMore'
  | 'postNotFound'
  | 'noPosts'
  | 'followers'
  | 'following'
  | 'hiveInfo'
  | 'reputation'
  | 'joined'
  | 'posts'
  | 'location'
  | 'website'
  | 'likes'
  | 'comments'
  | 'reblogs'
  | 'replies'
  | 'blog'
  | 'newest'
  | 'trending'
  | 'authorReputation'
  | 'votes'
  | 'discussion'
  | 'readTime'
  | 'minRead'
  | 'login'
  | 'logout'
  | 'login_to_comment'
  | 'login_to_vote'
  | 'login_to_reblog'
  | 'write_comment'
  | 'posting'
  | 'post_comment'
  | 'create_post'
  | 'subscribers'
  | 'authors'
  | 'community_info'
  | 'created'
  | 'language'
  | 'pending_posts'
  | 'team'
  | 'search'
  | 'searching'
  | 'search_error'
  | 'no_results'
  | 'results_for'
  | 'enter_search_query'
  | 'listen'
  | 'pause'
  | 'resume'
  | 'stop'
  | 'reblogging'
  | 'reblog_confirm'
  | 'cant_reblog_own'
  | 'already_reblogged'
  | 'reblog_to_followers'
  | 'error_loading'
  | 'retry'
  | 'community_not_found'
  | 'page_not_found'
  | 'page_not_found_description'
  | 'back_to_blog'
  | 'claim_title_blog'
  | 'claim_title_community'
  | 'claim_subtitle'
  | 'claim_cta'
  | 'edit_post'
  | 'updating'
  | 'update'
  | 'editor_start_writing'
  | 'editor_link'
  | 'editor_link_remove'
  | 'editor_link_prompt'
  | 'editor_markdown_fallback'
  | 'editor_post_title'
  | 'tip_amount'
  | 'tip_custom'
  | 'tip_currency'
  | 'tip_private_key'
  | 'tip_wallet_address'
  | 'tip_no_wallet_address'
  | 'tip_send'
  | 'tip_sending'
  | 'tip_login_to_send'
  | 'tip_asset_not_supported'
  | 'tip_transaction_failed'
  | 'tip_qr_no_address'
  | 'tip_qr_failed'
  | 'cancel'
  | 'rewards_pending'
  | 'rewards_earned'
  | 'rewards_declined'
  | 'payout_window'
  | 'payout_hint'
  | 'published_on_hive'
  | 'view_on_hive'
  | 'hive_disclosure_vote'
  | 'hive_disclosure_comment'
  | 'hive_disclosure_publish'
  | 'join_community'
  | 'leave_community'
  | 'joining'
  | 'leaving'
  | 'community_membership_failed'
  | 'reputation_band_new'
  | 'reputation_band_established'
  | 'reputation_band_longstanding'
  | 'confirming'
  | 'membership_unconfirmed'
  | 'check_again'
  | 'posts_load_failed'
  | 'post_refresh_failed'
  | 'comments_loading'
  | 'comments_empty'
  | 'comments_load_failed'
  | 'comments_incomplete'
  | 'community_load_failed'
  | 'app_error_title'
  | 'app_error_description'
  | 'reload_page'
  | 'community_refresh_failed'
  | 'edit_read_failed'
  | 'login_owner_hint';

type Translations = Record<TranslationKey, string>;

const translations: Record<string, Translations> = {
  en: {
    loading: "Loading...",
    hivesigner_login_failed: 'Sign in could not be completed. Please try again.',
    loadingPost: "Loading post...",
    loadingMore: "Loading more posts...",
    postNotFound: "Post not found.",
    noPosts: "No posts found.",
    followers: "Followers",
    following: "Following",
    hiveInfo: "Hive Info",
    reputation: "Reputation",
    joined: "Joined",
    posts: "Posts",
    location: "Location",
    website: "Website",
    likes: "likes",
    comments: "comments",
    reblogs: "reblogs",
    replies: "Replies",
    blog: "Blog",
    newest: "Newest",
    trending: "Trending",
    authorReputation: "Author Reputation",
    votes: "Votes",
    discussion: "Discussion",
    readTime: "read",
    minRead: "min read",
    login: "Login",
    logout: "Logout",
    login_to_comment: "Login to leave a comment",
    login_to_vote: "Login to vote",
    login_to_reblog: "Login to reblog",
    write_comment: "Write a comment...",
    posting: "Posting...",
    post_comment: "Post Comment",
    create_post: "Create Post",
    subscribers: "Subscribers",
    authors: "Authors",
    community_info: "Community Info",
    created: "Created",
    language: "Language",
    pending_posts: "Pending Posts",
    team: "Team",
    search: "Search",
    searching: "Searching...",
    search_error: "Search failed. Please try again.",
    no_results: "No results found.",
    results_for: "results for",
    enter_search_query: "Enter a search term to find posts.",
    listen: "Listen",
    pause: "Pause",
    resume: "Resume",
    stop: "Stop",
    reblogging: "Reblogging...",
    reblog_confirm:
      "Are you sure you want to reblog this post to your followers?",
    cant_reblog_own: "You can't reblog your own post",
    already_reblogged: 'Already reblogged',
    reblog_to_followers: 'Reblog to your followers',
    error_loading: 'Something went wrong. Please try again.',
    retry: 'Retry',
    community_not_found: 'Community not found.',
    page_not_found: 'Page not found',
    page_not_found_description: 'The page you are looking for does not exist.',
    back_to_blog: 'Back to blog',
    claim_title_blog: "This blog isn't set up yet",
    claim_title_community: "This community isn't set up yet",
    claim_subtitle: 'Is this yours? Claim it and launch on Ecency in minutes.',
    claim_cta: 'Claim on Ecency',
    edit_post: 'Edit',
    updating: 'Updating...',
    update: 'Update',
    editor_start_writing: 'Start writing...',
    editor_link: 'Link',
    editor_link_remove: 'Remove link',
    editor_link_prompt: 'Enter the link address',
    editor_markdown_fallback: 'This post contains embeds or HTML the rich text editor cannot represent. Editing as markdown so nothing is lost.',
    editor_post_title: 'Post title...',
    tip_amount: 'Amount',
    tip_custom: 'Custom',
    tip_currency: 'Currency',
    tip_private_key: 'Active key',
    tip_wallet_address: 'Wallet address',
    tip_no_wallet_address: 'Recipient has not set up this wallet address.',
    tip_send: 'Tip',
    tip_sending: 'Sending...',
    tip_login_to_send: 'Login to send a tip',
    tip_asset_not_supported: 'This asset is not supported for tipping yet',
    tip_transaction_failed: 'Transaction failed',
    tip_qr_no_address: 'No address',
    tip_qr_failed: 'Failed to generate QR',
    cancel: 'Cancel',
    rewards_pending: 'Pending rewards',
    rewards_earned: 'Earned',
    rewards_declined: 'Rewards declined',
    payout_window: 'Pays out',
    payout_hint: 'Estimated value in HIVE Power and HBD',
    published_on_hive: 'Published on Hive',
    view_on_hive: 'View this post on Hive',
    hive_disclosure_vote:
      'Liking casts a vote on Hive and spends part of your voting power.',
    hive_disclosure_comment:
      'Comments are published to Hive. They are public and cannot be deleted.',
    hive_disclosure_publish:
      'Publishing writes this post publicly and permanently to Hive. Rewards close 7 days after publishing.',
    join_community: 'Join',
    leave_community: 'Leave',
    joining: 'Joining...',
    leaving: 'Leaving...',
    community_membership_failed:
      'Could not update your membership. Please try again.',
    reputation_band_new: 'New',
    reputation_band_established: 'Established',
    reputation_band_longstanding: 'Long standing',
    confirming: 'Confirming...',
    membership_unconfirmed:
      'Sent to Hive. The community has not confirmed this yet. Reload in a moment to check.',
    check_again: 'Check again',
    posts_load_failed: 'Could not load more posts.',
    post_refresh_failed: 'Could not refresh this post.',
    comments_loading: 'Loading comments...',
    comments_empty: 'No comments yet. Be the first to comment!',
    comments_load_failed: 'Could not load comments.',
    comments_incomplete: 'Some comments could not be loaded.',
    community_load_failed: 'Could not load community details.',
    app_error_title: 'Something went wrong',
    app_error_description:
      'This page could not be displayed. Reloading usually fixes it.',
    reload_page: 'Reload',
    community_refresh_failed: 'Could not refresh community details.',
    edit_read_failed:
      'Could not load the current version of this post. Editing stays closed until it loads, so a save cannot overwrite newer changes.',
    login_owner_hint:
      'If this site is yours, sign in with the account that owns it to change the title, logo, theme and layout. Those settings can only be saved from Hivesigner or a Hive browser extension; a HiveAuth session can vote and comment but cannot save them yet.',
  },
  es: {
    loading: 'Cargando...',
    hivesigner_login_failed: 'No se pudo completar el inicio de sesión. Inténtalo de nuevo.',
    loadingPost: 'Cargando publicación...',
    loadingMore: 'Cargando más publicaciones...',
    postNotFound: 'Publicación no encontrada.',
    noPosts: 'No se encontraron publicaciones.',
    followers: 'Seguidores',
    following: 'Siguiendo',
    hiveInfo: 'Info de Hive',
    reputation: 'Reputación',
    joined: 'Se unió',
    posts: 'Publicaciones',
    location: 'Ubicación',
    website: 'Sitio web',
    likes: 'me gusta',
    comments: 'comentarios',
    reblogs: 'reblogueos',
    replies: 'Respuestas',
    blog: 'Blog',
    newest: 'Más reciente',
    trending: 'Tendencia',
    authorReputation: 'Reputación del autor',
    votes: 'Votos',
    discussion: 'Discusión',
    readTime: 'lectura',
    minRead: 'min de lectura',
    login: 'Iniciar sesión',
    logout: 'Cerrar sesión',
    login_to_comment: 'Inicia sesión para comentar',
    login_to_vote: 'Inicia sesión para votar',
    login_to_reblog: 'Inicia sesión para rebloguear',
    write_comment: 'Escribe un comentario...',
    posting: 'Publicando...',
    post_comment: 'Publicar comentario',
    create_post: 'Crear publicación',
    subscribers: 'Suscriptores',
    authors: 'Autores',
    community_info: 'Info de Comunidad',
    created: 'Creado',
    language: 'Idioma',
    pending_posts: 'Posts Pendientes',
    team: 'Equipo',
    search: 'Buscar',
    searching: 'Buscando...',
    search_error: 'Error en la búsqueda. Intente de nuevo.',
    no_results: 'No se encontraron resultados.',
    results_for: 'resultados para',
    enter_search_query: 'Ingrese un término para buscar publicaciones.',
    listen: 'Escuchar',
    pause: 'Pausar',
    resume: 'Reanudar',
    stop: 'Detener',
    reblogging: 'Reblogueando...',
    reblog_confirm: '¿Estás seguro de que quieres rebloguear esta publicación a tus seguidores?',
    cant_reblog_own: 'No puedes rebloguear tu propia publicación',
    already_reblogged: 'Ya reblogueado',
    reblog_to_followers: 'Rebloguear a tus seguidores',
    error_loading: 'Algo salió mal. Por favor, intente de nuevo.',
    retry: 'Reintentar',
    community_not_found: 'Comunidad no encontrada.',
    page_not_found: 'Página no encontrada',
    page_not_found_description: 'La página que buscas no existe.',
    back_to_blog: 'Volver al blog',
    claim_title_blog: "This blog isn't set up yet",
    claim_title_community: "This community isn't set up yet",
    claim_subtitle: 'Is this yours? Claim it and launch on Ecency in minutes.',
    claim_cta: 'Claim on Ecency',
    edit_post: 'Editar',
    updating: 'Actualizando...',
    update: 'Actualizar',
    editor_start_writing: 'Empieza a escribir...',
    editor_link: 'Enlace',
    editor_link_remove: 'Quitar enlace',
    editor_link_prompt: 'Introduce la dirección del enlace',
    editor_markdown_fallback: 'Esta publicación contiene incrustaciones o HTML que el editor visual no puede representar. Se edita como markdown para no perder nada.',
    editor_post_title: 'Título de la publicación...',
    tip_amount: 'Cantidad',
    tip_custom: 'Personalizado',
    tip_currency: 'Moneda',
    tip_private_key: 'Clave activa',
    tip_wallet_address: 'Dirección de cartera',
    tip_no_wallet_address: 'El destinatario no ha configurado esta dirección.',
    tip_send: 'Propina',
    tip_sending: 'Enviando...',
    tip_login_to_send: 'Inicia sesión para enviar una propina',
    tip_asset_not_supported: 'Este activo aún no es compatible con las propinas',
    tip_transaction_failed: 'Transacción fallida',
    tip_qr_no_address: 'Sin dirección',
    tip_qr_failed: 'Error al generar el QR',
    cancel: 'Cancelar',
    rewards_pending: 'Recompensas pendientes',
    rewards_earned: 'Ganado',
    rewards_declined: 'Recompensas rechazadas',
    payout_window: 'Se paga',
    payout_hint: 'Valor estimado en HIVE Power y HBD',
    published_on_hive: 'Publicado en Hive',
    view_on_hive: 'Ver esta publicación en Hive',
    hive_disclosure_vote:
      'Dar me gusta emite un voto en Hive y consume parte de tu poder de voto.',
    hive_disclosure_comment:
      'Los comentarios se publican en Hive. Son públicos y no se pueden borrar.',
    hive_disclosure_publish:
      'Al publicar, esta entrada se escribe en Hive de forma pública y permanente. Las recompensas se cierran 7 días después de publicar.',
    join_community: 'Unirse',
    leave_community: 'Salir',
    joining: 'Uniéndose...',
    leaving: 'Saliendo...',
    community_membership_failed:
      'No se pudo actualizar tu membresía. Inténtalo de nuevo.',
    reputation_band_new: 'Nueva',
    reputation_band_established: 'Establecida',
    reputation_band_longstanding: 'Veterana',
    confirming: 'Confirmando...',
    membership_unconfirmed:
      'Enviado a Hive. La comunidad todavía no lo ha confirmado. Vuelve a cargar en un momento para comprobarlo.',
    check_again: 'Comprobar de nuevo',
    posts_load_failed: 'No se pudieron cargar más publicaciones.',
    post_refresh_failed: 'No se pudo actualizar esta publicación.',
    comments_loading: 'Cargando comentarios...',
    comments_empty: 'Aún no hay comentarios. ¡Sé el primero en comentar!',
    comments_load_failed: 'No se pudieron cargar los comentarios.',
    comments_incomplete: 'Algunos comentarios no se pudieron cargar.',
    community_load_failed:
      'No se pudieron cargar los datos de la comunidad.',
    app_error_title: 'Algo salió mal',
    app_error_description:
      'No se pudo mostrar esta página. Recargar suele solucionarlo.',
    reload_page: 'Recargar',
    community_refresh_failed:
      'No se pudieron actualizar los datos de la comunidad.',
    edit_read_failed:
      'No se pudo cargar la versión actual de esta publicación. La edición permanece cerrada hasta que cargue, para que al guardar no se sobrescriban cambios más nuevos.',
    login_owner_hint:
      'Si este sitio es tuyo, inicia sesión con la cuenta propietaria para cambiar el título, el logo, el tema y el diseño. Esos ajustes solo se pueden guardar desde Hivesigner o una extensión de navegador de Hive; una sesión de HiveAuth puede votar y comentar, pero todavía no puede guardarlos.',
  },
  de: {
    loading: 'Lädt...',
    hivesigner_login_failed: 'Die Anmeldung konnte nicht abgeschlossen werden. Bitte versuche es erneut.',
    loadingPost: 'Beitrag wird geladen...',
    loadingMore: 'Weitere Beiträge laden...',
    postNotFound: 'Beitrag nicht gefunden.',
    noPosts: 'Keine Beiträge gefunden.',
    followers: 'Follower',
    following: 'Folgt',
    hiveInfo: 'Hive-Info',
    reputation: 'Reputation',
    joined: 'Beigetreten',
    posts: 'Beiträge',
    location: 'Standort',
    website: 'Webseite',
    likes: 'Gefällt mir',
    comments: 'Kommentare',
    reblogs: 'Reblogs',
    replies: 'Antworten',
    blog: 'Blog',
    newest: 'Neueste',
    trending: 'Trending',
    authorReputation: 'Autoren-Reputation',
    votes: 'Stimmen',
    discussion: 'Diskussion',
    readTime: 'Lesezeit',
    minRead: 'Min. Lesezeit',
    login: 'Anmelden',
    logout: 'Abmelden',
    login_to_comment: 'Melden Sie sich an, um zu kommentieren',
    login_to_vote: 'Melden Sie sich an, um abzustimmen',
    login_to_reblog: 'Melden Sie sich an, um zu rebloggen',
    write_comment: 'Schreibe einen Kommentar...',
    posting: 'Wird gepostet...',
    post_comment: 'Kommentar posten',
    create_post: 'Beitrag erstellen',
    subscribers: 'Abonnenten',
    authors: 'Autoren',
    community_info: 'Community-Info',
    created: 'Erstellt',
    language: 'Sprache',
    pending_posts: 'Ausstehende Beiträge',
    team: 'Team',
    search: 'Suchen',
    searching: 'Suche...',
    search_error: 'Suche fehlgeschlagen. Bitte erneut versuchen.',
    no_results: 'Keine Ergebnisse gefunden.',
    results_for: 'Ergebnisse für',
    enter_search_query: 'Geben Sie einen Suchbegriff ein.',
    listen: 'Anhören',
    pause: 'Pause',
    resume: 'Fortsetzen',
    stop: 'Stopp',
    reblogging: 'Rebloggen...',
    reblog_confirm: 'Möchten Sie diesen Beitrag wirklich an Ihre Follower rebloggen?',
    cant_reblog_own: 'Sie können Ihren eigenen Beitrag nicht rebloggen',
    already_reblogged: 'Bereits rebloggt',
    reblog_to_followers: 'An Ihre Follower rebloggen',
    error_loading: 'Etwas ist schief gelaufen. Bitte versuchen Sie es erneut.',
    retry: 'Erneut versuchen',
    community_not_found: 'Community nicht gefunden.',
    page_not_found: 'Seite nicht gefunden',
    page_not_found_description: 'Die gesuchte Seite existiert nicht.',
    back_to_blog: 'Zurück zum Blog',
    claim_title_blog: "This blog isn't set up yet",
    claim_title_community: "This community isn't set up yet",
    claim_subtitle: 'Is this yours? Claim it and launch on Ecency in minutes.',
    claim_cta: 'Claim on Ecency',
    edit_post: 'Bearbeiten',
    updating: 'Aktualisierung...',
    update: 'Aktualisieren',
    editor_start_writing: 'Beginne zu schreiben...',
    editor_link: 'Link',
    editor_link_remove: 'Link entfernen',
    editor_link_prompt: 'Gib die Link-Adresse ein',
    editor_markdown_fallback: 'Dieser Beitrag enthält Einbettungen oder HTML, die der visuelle Editor nicht darstellen kann. Er wird als Markdown bearbeitet, damit nichts verloren geht.',
    editor_post_title: 'Beitragstitel...',
    tip_amount: 'Betrag',
    tip_custom: 'Benutzerdefiniert',
    tip_currency: 'Währung',
    tip_private_key: 'Aktiver Schlüssel',
    tip_wallet_address: 'Wallet-Adresse',
    tip_no_wallet_address: 'Der Empfänger hat diese Wallet-Adresse nicht eingerichtet.',
    tip_send: 'Trinkgeld',
    tip_sending: 'Senden...',
    tip_login_to_send: 'Melde dich an, um ein Trinkgeld zu senden',
    tip_asset_not_supported: 'Dieses Asset wird für Trinkgelder noch nicht unterstützt',
    tip_transaction_failed: 'Transaktion fehlgeschlagen',
    tip_qr_no_address: 'Keine Adresse',
    tip_qr_failed: 'QR-Generierung fehlgeschlagen',
    cancel: 'Abbrechen',
    rewards_pending: 'Ausstehende Belohnungen',
    rewards_earned: 'Verdient',
    rewards_declined: 'Belohnungen abgelehnt',
    payout_window: 'Auszahlung',
    payout_hint: 'Geschätzter Wert in HIVE Power und HBD',
    published_on_hive: 'Auf Hive veröffentlicht',
    view_on_hive: 'Diesen Beitrag auf Hive ansehen',
    hive_disclosure_vote:
      'Ein Like ist eine Stimme auf Hive und verbraucht einen Teil deiner Stimmkraft.',
    hive_disclosure_comment:
      'Kommentare werden auf Hive veröffentlicht. Sie sind öffentlich und können nicht gelöscht werden.',
    hive_disclosure_publish:
      'Das Veröffentlichen schreibt diesen Beitrag öffentlich und dauerhaft auf Hive. Belohnungen enden 7 Tage nach der Veröffentlichung.',
    join_community: 'Beitreten',
    leave_community: 'Verlassen',
    joining: 'Beitritt...',
    leaving: 'Austritt...',
    community_membership_failed:
      'Mitgliedschaft konnte nicht aktualisiert werden. Bitte erneut versuchen.',
    reputation_band_new: 'Neu',
    reputation_band_established: 'Etabliert',
    reputation_band_longstanding: 'Langjährig',
    confirming: 'Wird bestätigt...',
    membership_unconfirmed:
      'An Hive gesendet. Die Community hat es noch nicht bestätigt. Lade die Seite gleich neu, um nachzusehen.',
    check_again: 'Erneut prüfen',
    posts_load_failed: 'Weitere Beiträge konnten nicht geladen werden.',
    post_refresh_failed: 'Dieser Beitrag konnte nicht aktualisiert werden.',
    comments_loading: 'Kommentare werden geladen...',
    comments_empty: 'Noch keine Kommentare. Schreibe den ersten!',
    comments_load_failed: 'Kommentare konnten nicht geladen werden.',
    comments_incomplete:
      'Einige Kommentare konnten nicht geladen werden.',
    community_load_failed: 'Community-Daten konnten nicht geladen werden.',
    app_error_title: 'Etwas ist schief gelaufen',
    app_error_description:
      'Diese Seite konnte nicht angezeigt werden. Ein Neuladen hilft meistens.',
    reload_page: 'Neu laden',
    community_refresh_failed:
      'Community-Daten konnten nicht aktualisiert werden.',
    edit_read_failed:
      'Die aktuelle Fassung dieses Beitrags konnte nicht geladen werden. Die Bearbeitung bleibt geschlossen, bis sie geladen ist, damit ein Speichern keine neueren Änderungen überschreibt.',
    login_owner_hint:
      'Wenn diese Website Ihnen gehört, melden Sie sich mit dem Konto an, dem sie gehört, um Titel, Logo, Design und Layout zu ändern. Diese Einstellungen lassen sich nur über Hivesigner oder eine Hive-Browsererweiterung speichern; eine HiveAuth-Sitzung kann abstimmen und kommentieren, sie aber noch nicht speichern.',
  },
  fr: {
    loading: "Chargement...",
    hivesigner_login_failed: "La connexion n'a pas pu aboutir. Veuillez réessayer.",
    loadingPost: "Chargement de l'article...",
    loadingMore: "Chargement d'autres articles...",
    postNotFound: "Article non trouvé.",
    noPosts: "Aucun article trouvé.",
    followers: "Abonnés",
    following: "Abonnements",
    hiveInfo: "Info Hive",
    reputation: "Réputation",
    joined: "Inscrit",
    posts: "Articles",
    location: "Lieu",
    website: "Site web",
    likes: "j'aime",
    comments: "commentaires",
    reblogs: "repartages",
    replies: "Réponses",
    blog: "Blog",
    newest: "Plus récent",
    trending: "Tendances",
    authorReputation: "Réputation de l'auteur",
    votes: "Votes",
    discussion: "Discussion",
    readTime: "lecture",
    minRead: "min de lecture",
    login: "Connexion",
    logout: "Déconnexion",
    login_to_comment: "Connectez-vous pour commenter",
    login_to_vote: "Connectez-vous pour voter",
    login_to_reblog: "Connectez-vous pour repartager",
    write_comment: "Écrire un commentaire...",
    posting: "Publication...",
    post_comment: "Publier le commentaire",
    create_post: "Créer un article",
    subscribers: "Abonnés",
    authors: "Auteurs",
    community_info: "Info Communauté",
    created: "Créé",
    language: "Langue",
    pending_posts: "Articles en attente",
    team: "Équipe",
    search: "Rechercher",
    searching: "Recherche...",
    search_error: "La recherche a échoué. Veuillez réessayer.",
    no_results: "Aucun résultat trouvé.",
    results_for: "résultats pour",
    enter_search_query: "Entrez un terme pour rechercher des articles.",
    listen: "Écouter",
    pause: "Pause",
    resume: "Reprendre",
    stop: "Arrêter",
    reblogging: "Repartage...",
    reblog_confirm:
      "Êtes-vous sûr de vouloir repartager cet article à vos abonnés?",
    cant_reblog_own: "Vous ne pouvez pas repartager votre propre article",
    already_reblogged: "Déjà repartagé",
    reblog_to_followers: "Repartager à vos abonnés",
    error_loading: "Une erreur s'est produite. Veuillez réessayer.",
    retry: 'Réessayer',
    community_not_found: 'Communauté introuvable.',
    page_not_found: 'Page non trouvée',
    page_not_found_description: "La page que vous recherchez n'existe pas.",
    back_to_blog: 'Retour au blog',
    claim_title_blog: "This blog isn't set up yet",
    claim_title_community: "This community isn't set up yet",
    claim_subtitle: 'Is this yours? Claim it and launch on Ecency in minutes.',
    claim_cta: 'Claim on Ecency',
    edit_post: 'Modifier',
    updating: 'Mise à jour...',
    update: 'Mettre à jour',
    editor_start_writing: 'Commencez à écrire...',
    editor_link: 'Lien',
    editor_link_remove: 'Supprimer le lien',
    editor_link_prompt: "Saisissez l'adresse du lien",
    editor_markdown_fallback: "Cet article contient des intégrations ou du HTML que l'éditeur visuel ne peut pas représenter. Il est modifié en markdown pour ne rien perdre.",
    editor_post_title: "Titre de l'article...",
    tip_amount: 'Montant',
    tip_custom: 'Personnalisé',
    tip_currency: 'Devise',
    tip_private_key: 'Clé active',
    tip_wallet_address: 'Adresse du portefeuille',
    tip_no_wallet_address: "Le destinataire n'a pas configuré cette adresse.",
    tip_send: 'Pourboire',
    tip_sending: 'Envoi...',
    tip_login_to_send: 'Connectez-vous pour envoyer un pourboire',
    tip_asset_not_supported: "Cet actif n'est pas encore pris en charge pour les pourboires",
    tip_transaction_failed: 'Échec de la transaction',
    tip_qr_no_address: 'Aucune adresse',
    tip_qr_failed: 'Échec de la génération du QR',
    cancel: 'Annuler',
    rewards_pending: 'Récompenses en attente',
    rewards_earned: 'Gagné',
    rewards_declined: 'Récompenses refusées',
    payout_window: 'Paiement',
    payout_hint: 'Valeur estimée en HIVE Power et HBD',
    published_on_hive: 'Publié sur Hive',
    view_on_hive: 'Voir ce billet sur Hive',
    hive_disclosure_vote:
      'Aimer envoie un vote sur Hive et consomme une partie de votre pouvoir de vote.',
    hive_disclosure_comment:
      'Les commentaires sont publiés sur Hive. Ils sont publics et ne peuvent pas être supprimés.',
    hive_disclosure_publish:
      'La publication écrit ce billet sur Hive de façon publique et permanente. Les récompenses se ferment 7 jours après la publication.',
    join_community: 'Rejoindre',
    leave_community: 'Quitter',
    joining: 'Adhésion...',
    leaving: 'Départ...',
    community_membership_failed:
      'Impossible de mettre à jour votre adhésion. Veuillez réessayer.',
    reputation_band_new: 'Nouveau',
    reputation_band_established: 'Établi',
    reputation_band_longstanding: 'De longue date',
    confirming: 'Confirmation...',
    membership_unconfirmed:
      "Envoyé à Hive. La communauté ne l'a pas encore confirmé. Rechargez dans un instant pour vérifier.",
    check_again: 'Vérifier à nouveau',
    posts_load_failed: "Impossible de charger plus d'articles.",
    post_refresh_failed: "Impossible d'actualiser cet article.",
    comments_loading: 'Chargement des commentaires...',
    comments_empty: 'Aucun commentaire pour le moment. Soyez le premier!',
    comments_load_failed: 'Impossible de charger les commentaires.',
    comments_incomplete:
      "Certains commentaires n'ont pas pu être chargés.",
    community_load_failed:
      'Impossible de charger les informations de la communauté.',
    app_error_title: "Une erreur s'est produite",
    app_error_description:
      "Cette page n'a pas pu s'afficher. Recharger règle souvent le problème.",
    reload_page: 'Recharger',
    community_refresh_failed:
      'Impossible d\'actualiser les informations de la communauté.',
    edit_read_failed:
      "Impossible de charger la version actuelle de cet article. L'édition reste fermée tant qu'elle n'a pas chargé, pour qu'un enregistrement n'écrase pas des modifications plus récentes.",
    login_owner_hint:
      "Si ce site est le vôtre, connectez-vous avec le compte qui en est propriétaire pour modifier le titre, le logo, le thème et la mise en page. Ces réglages ne peuvent être enregistrés que depuis Hivesigner ou une extension de navigateur Hive ; une session HiveAuth peut voter et commenter, mais pas encore les enregistrer.",
  },
  ko: {
    loading: '로딩 중...',
    hivesigner_login_failed: '로그인을 완료하지 못했습니다. 다시 시도해 주세요.',
    loadingPost: '게시물 로딩 중...',
    loadingMore: '더 많은 게시물 로딩 중...',
    postNotFound: '게시물을 찾을 수 없습니다.',
    noPosts: '게시물이 없습니다.',
    followers: '팔로워',
    following: '팔로잉',
    hiveInfo: 'Hive 정보',
    reputation: '평판',
    joined: '가입일',
    posts: '게시물',
    location: '위치',
    website: '웹사이트',
    likes: '좋아요',
    comments: '댓글',
    reblogs: '리블로그',
    replies: '답글',
    blog: '블로그',
    newest: '최신',
    trending: '인기',
    authorReputation: '작성자 평판',
    votes: '투표',
    discussion: '토론',
    readTime: '읽기',
    minRead: '분 읽기',
    login: '로그인',
    logout: '로그아웃',
    login_to_comment: '댓글을 남기려면 로그인하세요',
    login_to_vote: '투표하려면 로그인하세요',
    login_to_reblog: '리블로그하려면 로그인하세요',
    write_comment: '댓글 작성...',
    posting: '게시 중...',
    post_comment: '댓글 게시',
    create_post: '게시물 작성',
    subscribers: '구독자',
    authors: '작성자',
    community_info: '커뮤니티 정보',
    created: '생성됨',
    language: '언어',
    pending_posts: '대기 중인 게시물',
    team: '팀',
    search: '검색',
    searching: '검색 중...',
    search_error: '검색에 실패했습니다. 다시 시도해주세요.',
    no_results: '결과가 없습니다.',
    results_for: '검색 결과',
    enter_search_query: '검색어를 입력하세요.',
    listen: '듣기',
    pause: '일시정지',
    resume: '재개',
    stop: '정지',
    reblogging: '리블로그 중...',
    reblog_confirm: '이 게시물을 팔로워들에게 리블로그하시겠습니까?',
    cant_reblog_own: '자신의 게시물은 리블로그할 수 없습니다',
    already_reblogged: '이미 리블로그됨',
    reblog_to_followers: '팔로워에게 리블로그',
    error_loading: '문제가 발생했습니다. 다시 시도해주세요.',
    retry: '다시 시도',
    community_not_found: '커뮤니티를 찾을 수 없습니다.',
    page_not_found: '페이지를 찾을 수 없습니다',
    page_not_found_description: '찾으시는 페이지가 존재하지 않습니다.',
    back_to_blog: '블로그로 돌아가기',
    claim_title_blog: "This blog isn't set up yet",
    claim_title_community: "This community isn't set up yet",
    claim_subtitle: 'Is this yours? Claim it and launch on Ecency in minutes.',
    claim_cta: 'Claim on Ecency',
    edit_post: '편집',
    updating: '업데이트 중...',
    update: '업데이트',
    editor_start_writing: '글을 작성하세요...',
    editor_link: '링크',
    editor_link_remove: '링크 제거',
    editor_link_prompt: '링크 주소를 입력하세요',
    editor_markdown_fallback: '이 게시물에는 리치 텍스트 편집기가 표현할 수 없는 임베드나 HTML이 있습니다. 내용이 손실되지 않도록 마크다운으로 편집합니다.',
    editor_post_title: '게시물 제목...',
    tip_amount: '금액',
    tip_custom: '사용자 정의',
    tip_currency: '통화',
    tip_private_key: '활성 키',
    tip_wallet_address: '지갑 주소',
    tip_no_wallet_address: '수신자가 이 지갑 주소를 설정하지 않았습니다.',
    tip_send: '팁',
    tip_sending: '전송 중...',
    tip_login_to_send: '팁을 보내려면 로그인하세요',
    tip_asset_not_supported: '이 자산은 아직 팁으로 지원되지 않습니다',
    tip_transaction_failed: '거래 실패',
    tip_qr_no_address: '주소 없음',
    tip_qr_failed: 'QR 생성 실패',
    cancel: '취소',
    rewards_pending: '대기 중인 보상',
    rewards_earned: '획득',
    rewards_declined: '보상 거부됨',
    payout_window: '지급',
    payout_hint: 'HIVE Power와 HBD로 환산한 예상 금액',
    published_on_hive: 'Hive에 게시됨',
    view_on_hive: 'Hive에서 이 글 보기',
    hive_disclosure_vote:
      '좋아요는 Hive에 투표를 기록하며 회원님의 투표력을 소모합니다.',
    hive_disclosure_comment:
      '댓글은 Hive에 게시됩니다. 공개되며 삭제할 수 없습니다.',
    hive_disclosure_publish:
      '게시하면 이 글이 Hive에 공개적으로 영구히 기록됩니다. 보상은 게시 후 7일에 마감됩니다.',
    join_community: '가입',
    leave_community: '탈퇴',
    joining: '가입 중...',
    leaving: '탈퇴 중...',
    community_membership_failed: '멤버십을 변경하지 못했습니다. 다시 시도해 주세요.',
    reputation_band_new: '신규',
    reputation_band_established: '활동 중',
    reputation_band_longstanding: '오래된 계정',
    confirming: '확인 중...',
    membership_unconfirmed:
      'Hive로 전송했습니다. 커뮤니티가 아직 확인하지 않았습니다. 잠시 후 새로 고쳐 확인해 주세요.',
    check_again: '다시 확인',
    posts_load_failed: '게시물을 더 불러오지 못했습니다.',
    post_refresh_failed: '이 게시물을 새로 고치지 못했습니다.',
    comments_loading: '댓글 불러오는 중...',
    comments_empty: '아직 댓글이 없습니다. 첫 댓글을 남겨보세요!',
    comments_load_failed: '댓글을 불러오지 못했습니다.',
    comments_incomplete: '일부 댓글을 불러오지 못했습니다.',
    community_load_failed: '커뮤니티 정보를 불러오지 못했습니다.',
    app_error_title: '문제가 발생했습니다',
    app_error_description:
      '이 페이지를 표시할 수 없습니다. 새로 고치면 대개 해결됩니다.',
    reload_page: '새로 고침',
    community_refresh_failed: '커뮤니티 정보를 새로 고치지 못했습니다.',
    edit_read_failed:
      '이 게시물의 최신 버전을 불러오지 못했습니다. 저장할 때 더 새로운 변경 사항을 덮어쓰지 않도록, 불러올 때까지 편집을 열지 않습니다.',
    login_owner_hint:
      '이 사이트가 회원님의 것이라면 소유 계정으로 로그인해 제목, 로고, 테마, 레이아웃을 바꿀 수 있습니다. 이 설정은 Hivesigner 또는 Hive 브라우저 확장으로만 저장할 수 있습니다. HiveAuth 세션은 투표와 댓글은 되지만 아직 설정을 저장하지는 못합니다.',
  },
  ru: {
    loading: 'Загрузка...',
    hivesigner_login_failed: 'Не удалось завершить вход. Попробуйте ещё раз.',
    loadingPost: 'Загрузка поста...',
    loadingMore: 'Загрузка постов...',
    postNotFound: 'Пост не найден.',
    noPosts: 'Посты не найдены.',
    followers: 'Подписчики',
    following: 'Подписки',
    hiveInfo: 'Инфо Hive',
    reputation: 'Репутация',
    joined: 'Присоединился',
    posts: 'Посты',
    location: 'Местоположение',
    website: 'Веб-сайт',
    likes: 'лайков',
    comments: 'комментариев',
    reblogs: 'реблогов',
    replies: 'Ответы',
    blog: 'Блог',
    newest: 'Новые',
    trending: 'Популярные',
    authorReputation: 'Репутация автора',
    votes: 'Голоса',
    discussion: 'Обсуждение',
    readTime: 'чтение',
    minRead: 'мин чтения',
    login: 'Вход',
    logout: 'Выход',
    login_to_comment: 'Войдите, чтобы оставить комментарий',
    login_to_vote: 'Войдите, чтобы проголосовать',
    login_to_reblog: 'Войдите, чтобы сделать реблог',
    write_comment: 'Написать комментарий...',
    posting: 'Публикация...',
    post_comment: 'Опубликовать',
    create_post: 'Создать пост',
    subscribers: 'Подписчики',
    authors: 'Авторы',
    community_info: 'Информация о сообществе',
    created: 'Создано',
    language: 'Язык',
    pending_posts: 'Ожидающие посты',
    team: 'Команда',
    search: 'Поиск',
    searching: 'Поиск...',
    search_error: 'Ошибка поиска. Попробуйте снова.',
    no_results: 'Результаты не найдены.',
    results_for: 'результатов для',
    enter_search_query: 'Введите поисковый запрос.',
    listen: 'Слушать',
    pause: 'Пауза',
    resume: 'Продолжить',
    stop: 'Стоп',
    reblogging: 'Реблог...',
    reblog_confirm: 'Вы уверены, что хотите сделать реблог этого поста для ваших подписчиков?',
    cant_reblog_own: 'Вы не можете сделать реблог своего поста',
    already_reblogged: 'Уже сделан реблог',
    reblog_to_followers: 'Сделать реблог для подписчиков',
    error_loading: 'Что-то пошло не так. Пожалуйста, попробуйте снова.',
    retry: 'Повторить',
    community_not_found: 'Сообщество не найдено.',
    page_not_found: 'Страница не найдена',
    page_not_found_description: 'Запрашиваемая страница не существует.',
    back_to_blog: 'Вернуться в блог',
    claim_title_blog: "This blog isn't set up yet",
    claim_title_community: "This community isn't set up yet",
    claim_subtitle: 'Is this yours? Claim it and launch on Ecency in minutes.',
    claim_cta: 'Claim on Ecency',
    edit_post: 'Редактировать',
    updating: 'Обновление...',
    update: 'Обновить',
    editor_start_writing: 'Начните писать...',
    editor_link: 'Ссылка',
    editor_link_remove: 'Удалить ссылку',
    editor_link_prompt: 'Введите адрес ссылки',
    editor_markdown_fallback: 'В этом посте есть встроенные объекты или HTML, которые визуальный редактор не может отобразить. Редактирование идёт в markdown, чтобы ничего не потерялось.',
    editor_post_title: 'Заголовок поста...',
    tip_amount: 'Сумма',
    tip_custom: 'Другая',
    tip_currency: 'Валюта',
    tip_private_key: 'Активный ключ',
    tip_wallet_address: 'Адрес кошелька',
    tip_no_wallet_address: 'Получатель не настроил этот адрес кошелька.',
    tip_send: 'Чаевые',
    tip_sending: 'Отправка...',
    tip_login_to_send: 'Войдите, чтобы отправить чаевые',
    tip_asset_not_supported: 'Этот актив пока не поддерживается для чаевых',
    tip_transaction_failed: 'Транзакция не удалась',
    tip_qr_no_address: 'Нет адреса',
    tip_qr_failed: 'Не удалось создать QR-код',
    cancel: 'Отмена',
    rewards_pending: 'Ожидаемые награды',
    rewards_earned: 'Заработано',
    rewards_declined: 'Награды отклонены',
    payout_window: 'Выплата',
    payout_hint: 'Оценочная стоимость в HIVE Power и HBD',
    published_on_hive: 'Опубликовано в Hive',
    view_on_hive: 'Посмотреть этот пост в Hive',
    hive_disclosure_vote:
      'Лайк отправляет голос в Hive и расходует часть вашей силы голоса.',
    hive_disclosure_comment:
      'Комментарии публикуются в Hive. Они общедоступны, и их нельзя удалить.',
    hive_disclosure_publish:
      'Публикация записывает этот пост в Hive публично и навсегда. Награды закрываются через 7 дней после публикации.',
    join_community: 'Вступить',
    leave_community: 'Выйти',
    joining: 'Вступление...',
    leaving: 'Выход...',
    community_membership_failed:
      'Не удалось изменить членство. Попробуйте ещё раз.',
    reputation_band_new: 'Новый',
    reputation_band_established: 'Постоянный',
    reputation_band_longstanding: 'Давний',
    confirming: 'Подтверждение...',
    membership_unconfirmed:
      'Отправлено в Hive. Сообщество это ещё не подтвердило. Обновите страницу через минуту, чтобы проверить.',
    check_again: 'Проверить снова',
    posts_load_failed: 'Не удалось загрузить больше постов.',
    post_refresh_failed: 'Не удалось обновить этот пост.',
    comments_loading: 'Загрузка комментариев...',
    comments_empty: 'Комментариев пока нет. Оставьте первый!',
    comments_load_failed: 'Не удалось загрузить комментарии.',
    comments_incomplete: 'Некоторые комментарии не удалось загрузить.',
    community_load_failed: 'Не удалось загрузить данные сообщества.',
    app_error_title: 'Что-то пошло не так',
    app_error_description:
      'Не удалось отобразить эту страницу. Обычно помогает перезагрузка.',
    reload_page: 'Перезагрузить',
    community_refresh_failed:
      'Не удалось обновить данные сообщества.',
    edit_read_failed:
      'Не удалось загрузить текущую версию этого поста. Редактор не откроется, пока она не загрузится, чтобы сохранение не перезаписало более новые изменения.',
    login_owner_hint:
      'Если это ваш сайт, войдите с аккаунта-владельца, чтобы изменить название, логотип, тему и макет. Эти настройки сохраняются только через Hivesigner или расширение браузера для Hive; сессия HiveAuth может голосовать и комментировать, но пока не может их сохранить.',
  },
};

/**
 * Get a translated string for the given key
 */
export function t(key: TranslationKey): string {
  const language = InstanceConfigManager.getConfigValue(
    ({ configuration }) => configuration.general.language,
  );

  const langTranslations = translations[language] || translations.en;
  return langTranslations[key] || translations.en[key] || key;
}

/**
 * Get the current language code
 */
export function getCurrentLanguage(): string {
  return InstanceConfigManager.getConfigValue(
    ({ configuration }) => configuration.general.language,
  );
}

/**
 * Check if a language is supported
 */
export function isLanguageSupported(lang: string): boolean {
  return lang in translations;
}

/**
 * Get list of supported languages
 */
export function getSupportedLanguages(): string[] {
  return Object.keys(translations);
}
