const AddressModel = require('../models/address.model');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { generate: generateUuid } = require('../utils/uuid');
const db = require('../config/database');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Transforms camelCase request body keys to Joshua's column names.
 *
 * Joshua's schema uses slightly different column names than our old schema:
 *   streetAddress → address_line1
 *   aptUnit → address_line2
 *   label → nickname
 *   isDefault → is_primary
 */
function toDbFields(body) {
  const map = {
    nickname: 'nickname',
    addressLine1: 'address_line1',
    addressLine2: 'address_line2',
    isPrimary: 'is_primary',
    // These are already matching:
    // city, state, zip_code (zipCode), latitude, longitude
    zipCode: 'zip_code',
  };

  const result = {};
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined) continue;
    result[map[key] || key] = value;
  }
  return result;
}

const list = catchAsync(async (req, res) => {
  // In the new schema, addresses belong to care_receiver_id = user_id
  const addresses = await AddressModel.listForUser(req.user.id);
  res.json({ status: 200, data: addresses });
});

const create = catchAsync(async (req, res) => {
  const dbData = toDbFields(req.body);
  const addressId = generateUuid();

  await db('address').insert({
    address_id: db.raw('uuid_to_bin(?)', [addressId]),
    care_receiver_id: db.raw('uuid_to_bin(?)', [req.user.id]),
    ...dbData,
  });

  const address = await AddressModel.findById(addressId);
  res.status(201).json({ status: 201, data: address });
});

const update = catchAsync(async (req, res) => {
  const id = req.params.id;
  if (!id || !UUID_REGEX.test(id)) throw ApiError.badRequest('Invalid address ID');

  const address = await AddressModel.findById(id);
  if (!address) throw ApiError.notFound('Address not found');
  if (address.care_receiver_id !== req.user.id) throw ApiError.forbidden();

  const dbData = toDbFields(req.body);
  const updated = await AddressModel.update(id, dbData);
  res.json({ status: 200, data: updated });
});

const remove = catchAsync(async (req, res) => {
  const id = req.params.id;
  if (!id || !UUID_REGEX.test(id)) throw ApiError.badRequest('Invalid address ID');

  const address = await AddressModel.findById(id);
  if (!address) throw ApiError.notFound('Address not found');
  if (address.care_receiver_id !== req.user.id) throw ApiError.forbidden();

  await AddressModel.delete(id);
  res.status(204).send();
});

module.exports = { list, create, update, remove };
