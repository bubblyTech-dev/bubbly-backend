const { DataTypes, Sequelize } = require('sequelize');

// Shared by migrations. Lives outside database/migrations so sequelize-cli does not run it as a migration.
// Rules (see backend/claude/04-conventions.md): only email is required in the login tables, no unique constraints,
// integer status columns with the meaning in a comment, and proper non-unique indexes.

const timestampColumns = ({ updatedAt = true, deletedAt = false } = {}) => {
  const columns = {
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('NOW()'),
    },
  };

  if (updatedAt) {
    columns.updated_at = {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('NOW()'),
    };
  }

  if (deletedAt) {
    columns.deleted_at = {
      type: DataTypes.DATE,
      comment: 'Soft delete. Empty means not deleted',
    };
  }

  return columns;
};

const foreignKey = (table, { allowNull = true, onDelete = 'SET NULL', comment } = {}) => {
  const column = {
    type: DataTypes.BIGINT,
    allowNull,
    references: { model: table, key: 'id' },
    onUpdate: 'CASCADE',
    onDelete,
  };

  if (comment) column.comment = comment;

  return column;
};

// every entry is a column name or an array of column names (a composite index). None of them is unique.
const addIndexes = async (queryInterface, table, indexes) => {
  for (const columns of indexes) {
    const fields = Array.isArray(columns) ? columns : [columns];

    await queryInterface.addIndex(table, fields, {
      name: `${table}_${fields.join('_')}_idx`,
    });
  }
};

module.exports = { timestampColumns, foreignKey, addIndexes };
