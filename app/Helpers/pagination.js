const DEFAULT_PER_PAGE = 15;
const MAX_PER_PAGE = 100;

// Reads page and perPage from validated query input.
//   const { page, perPage, limit, offset } = paginationParams(req.validated);
//   const { rows, count } = await Model.findAndCountAll({ limit, offset });
//   Resource.paginate({ rows, count, page, perPage })
const paginationParams = ({ page, perPage } = {}) => {
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safePerPage = Math.min(MAX_PER_PAGE, Math.max(1, Number.parseInt(perPage, 10) || DEFAULT_PER_PAGE));

  return {
    page: safePage,
    perPage: safePerPage,
    limit: safePerPage,
    offset: (safePage - 1) * safePerPage,
  };
};

module.exports = { paginationParams, DEFAULT_PER_PAGE, MAX_PER_PAGE };
