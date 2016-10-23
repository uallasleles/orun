from orun.db import models
from orun.utils.translation import gettext_lazy as _


class ModelManager(models.Manager):
    use_in_migrations = True

    def __init__(self, *args, **kwargs):
        super(ModelManager, self).__init__(*args, **kwargs)
        # Cache shared by all the get_for_* methods to speed up
        # ContentType retrieval.
        self._cache = {}

    def get_by_natural_key(self, app_label, model):
        try:
            ct = self._cache[self.db][(app_label, model)]
        except KeyError:
            ct = self.get(app_label=app_label, model=model)
            self._add_to_cache(self.db, ct)
        return ct

    def _get_opts(self, model, for_concrete_model):
        if for_concrete_model:
            model = model._meta.concrete_model
        return model._meta

    def _get_from_cache(self, opts):
        key = (opts.app_label, opts.model_name)
        return self._cache[self.db][key]

    def get_for_model(self, model, for_concrete_model=True):
        """
        Returns the ContentType object for a given model, creating the
        ContentType if necessary. Lookups are cached so that subsequent lookups
        for the same model don't hit the database.
        """
        opts = self._get_opts(model, for_concrete_model)
        try:
            return self._get_from_cache(opts)
        except KeyError:
            pass

        # The ContentType entry was not found in the cache, therefore we
        # proceed to load or create it.
        try:
            # Start with get() and not get_or_create() in order to use
            # the db_for_read (see #20401).
            ct = self.get(app_label=opts.app_label, model=opts.model_name)
        except self.model.DoesNotExist:
            # Not found in the database; we proceed to create it. This time
            # use get_or_create to take care of any race conditions.
            ct, created = self.get_or_create(
                app_label=opts.app_label,
                model=opts.model_name,
            )
        self._add_to_cache(self.db, ct)
        return ct

    def get_for_models(self, *models, **kwargs):
        """
        Given *models, returns a dictionary mapping {model: content_type}.
        """
        for_concrete_models = kwargs.pop('for_concrete_models', True)
        # Final results
        results = {}
        # models that aren't already in the cache
        needed_app_labels = set()
        needed_models = set()
        needed_opts = set()
        for model in models:
            opts = self._get_opts(model, for_concrete_models)
            try:
                ct = self._get_from_cache(opts)
            except KeyError:
                needed_app_labels.add(opts.app_label)
                needed_models.add(opts.model_name)
                needed_opts.add(opts)
            else:
                results[model] = ct
        if needed_opts:
            cts = self.filter(
                app_label__in=needed_app_labels,
                model__in=needed_models
            )
            for ct in cts:
                model = ct.model_class()
                if model._meta in needed_opts:
                    results[model] = ct
                    needed_opts.remove(model._meta)
                self._add_to_cache(self.db, ct)
        for opts in needed_opts:
            # These weren't in the cache, or the DB, create them.
            ct = self.create(
                app_label=opts.app_label,
                model=opts.model_name,
            )
            self._add_to_cache(self.db, ct)
            results[ct.model_class()] = ct
        return results

    def get_for_id(self, id):
        """
        Lookup a ContentType by ID. Uses the same shared cache as get_for_model
        (though ContentTypes are obviously not created on-the-fly by get_by_id).
        """
        try:
            ct = self._cache[self.db][id]
        except KeyError:
            # This could raise a DoesNotExist; that's correct behavior and will
            # make sure that only correct ctypes get stored in the cache dict.
            ct = self.get(pk=id)
            self._add_to_cache(self.db, ct)
        return ct

    def clear_cache(self):
        """
        Clear out the content-type cache. This needs to happen during database
        flushes to prevent caching of "stale" content type IDs (see
        django.contrib.contenttypes.management.update_contenttypes for where
        this gets called).
        """
        self._cache.clear()

    def _add_to_cache(self, using, ct):
        """Insert a ContentType into the cache."""
        return
        # Note it's possible for ContentType objects to be stale; model_class() will return None.
        # Hence, there is no reliance on model._meta.app_label here, just using the model fields instead.
        key = (ct.app_label, ct.model)
        self._cache.setdefault(using, {})[key] = ct
        self._cache.setdefault(using, {})[ct.id] = ct


class Model(models.Model):
    name = models.CharField(null=False)
    parent = models.ForeignKey('self')
    app_label = models.CharField(64, null=False)
    object_name = models.CharField(null=False)
    object_type = models.CharField(16, null=False, default='user', choices=(
        ('user', 'User Model'),
        ('base', 'Base Model'),
    ))
    description = models.TextField()

    objects = ModelManager()

    class Meta:
        name = 'sys.model'

    def save(self, *args, **kwargs):
        if not self.object_name:
            self.object_name = self.name
        super(Model, self).save(*args, **kwargs)

    def model_class(self):
        "Returns the Python model class for this type of content."
        from orun import app
        try:
            return app.get_model(self.name)
        except LookupError:
            return None

    def get_object_for_this_type(self, **kwargs):
        """
        Returns an object of this type for the keyword arguments given.
        Basically, this is a proxy around this object_type's get_object() model
        method. The ObjectNotExist exception, if thrown, will not be caught,
        so code that calls this method should catch it.
        """
        return self.model_class()._base_manager.using(self._state.db).get(**kwargs)

    def get_all_objects_for_this_type(self, **kwargs):
        """
        Returns all objects of this type for the keyword arguments given.
        """
        return self.model_class()._base_manager.using(self._state.db).filter(**kwargs)

    def natural_key(self):
        return (self.app_label, self.model)


class Field(models.Model):
    name = models.CharField(null=False)
    full_name = models.CharField(256)
    model = models.ForeignKey(Model)
    copy = models.BooleanField(default=False)
    required = models.BooleanField(default=False)
    readonly = models.BooleanField(default=False)
    index = models.BooleanField(default=False)
    size = models.IntegerField()
    field_type = models.CharField(16, choices=(
        ('user', 'User Field'),
        ('base', 'Base Field'),
    ))
    domain = models.TextField()

    class Meta:
        name = 'sys.model.field'

