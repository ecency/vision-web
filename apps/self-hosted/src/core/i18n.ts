import { InstanceConfigManager } from "./configuration-loader";

// Translation keys used throughout the app
type TranslationKey =
  | 'loading'
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
  | 'cancel';

type Translations = Record<TranslationKey, string>;

const translations: Record<string, Translations> = {
  en: {
    loading: "Loading...",
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
  },
  es: {
    loading: 'Cargando...',
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
  },
  de: {
    loading: 'Lädt...',
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
  },
  fr: {
    loading: "Chargement...",
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
  },
  ko: {
    loading: '로딩 중...',
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
  },
  ru: {
    loading: 'Загрузка...',
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
